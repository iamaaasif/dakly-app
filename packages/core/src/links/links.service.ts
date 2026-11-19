import { createHmac, randomBytes, randomInt } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import type { AuditEntry } from '@dakly/contracts/audit';
import type { TrackedLinkSourceType } from '@dakly/contracts/campaigns';

import { ConsentService } from '../consents/consent.service';
import { RateLimiter } from '../platform/cache/rate-limiter';
import { ValkeyClient } from '../platform/cache/valkey-client';
import { Clock } from '../platform/clock';
import { loadEnv } from '../platform/config/env';
import { hashToken } from '../platform/crypto/token-hash';
import { newId } from '../platform/database/new-id';
import { StoreTransaction } from '../platform/database/store-transaction';
import { OutboxService } from '../platform/outbox/outbox.service';
import { linkError } from './links.errors';
import { LinksRepository, type NewTrackedLinkRow } from './links.repository';

type LinkSource = { sourceType: TrackedLinkSourceType; sourceId: string };
export type NewTrackedLink =
  | (LinkSource & { kind: 'redirect'; targetUrl: string; contactId: string | null })
  | (LinkSource & { kind: 'sms_opt_out'; contactId: string });
export type TrackedLink = { id: string; code: string; url: string };
export type Visitor = { ip: string; userAgent: string | undefined };

const CODE_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const CODE_ATTEMPTS = 3;
export const TRACKED_LINK_CODE_LENGTH = 8;
// Shared mobile carrier addresses put many customers behind one IP, so the limit is generous.
const TAPS_PER_IP_PER_MINUTE = 120;
// Longer than one Asia/Dhaka day, so the salt lives through the day it was made on and then goes.
const VISITOR_SALT_SECONDS = 2 * 24 * 60 * 60;
const KEEP_FIRST_SALT = `
redis.call('SET', KEYS[1], ARGV[1], 'NX', 'EX', ARGV[2])
return redis.call('GET', KEYS[1])
`;
const dhakaDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' });

@Injectable()
export class LinksService {
  constructor(
    @Inject(LinksRepository) private readonly repository: LinksRepository,
    @Inject(ConsentService) private readonly consent: ConsentService,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(RateLimiter) private readonly limiter: RateLimiter,
    @Inject(ValkeyClient) private readonly valkey: ValkeyClient,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  // Links come back in the order asked. Codes are unique across stores because the short link
  // names no store; a rare clash gets a new code.
  // Writes take the actor (services.md); nothing records it for links yet.
  async create(
    storeId: string,
    links: NewTrackedLink[],
    _actor: AuditEntry['actor'],
    base = this.shortLinkBase(),
  ): Promise<TrackedLink[]> {
    let pending: NewTrackedLinkRow[] = links.map((link) => ({
      targetUrl: null,
      ...link,
      id: newId(),
      code: newCode(),
    }));
    const rows = pending.slice();
    for (let attempt = 0; attempt < CODE_ATTEMPTS && pending.length; attempt++) {
      const saved = new Set(await this.repository.insert(storeId, pending));
      pending = pending.filter((row) => !saved.has(row.id));
      for (const row of pending) row.code = newCode();
    }
    if (pending.length) throw linkError('LINK_CODES_EXHAUSTED');
    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      url: linkUrl(row.kind, row.code, base),
    }));
  }

  // A resend must carry the same text, so a contact has one opt-out link per source.
  async optOutLink(
    storeId: string,
    link: LinkSource & { contactId: string },
    actor: AuditEntry['actor'],
    base = this.shortLinkBase(),
  ): Promise<TrackedLink> {
    const existing = await this.repository.findOptOutLinkFor(storeId, link);
    if (existing)
      return { id: existing.id, code: existing.code, url: this.optOutUrl(existing.code, base) };
    const [created] = await this.create(storeId, [{ ...link, kind: 'sms_opt_out' }], actor, base);
    return created!;
  }

  optOutUrl(code: string, base = this.shortLinkBase()): string {
    return linkUrl('sms_opt_out', code, base);
  }

  shortLinkBase(): string {
    return loadEnv().SHORT_LINK_BASE_URL;
  }

  // An opt-out address as long as a real one, so an estimate counts the characters it adds.
  sampleOptOutUrl(base = this.shortLinkBase()): string {
    return linkUrl('sms_opt_out', CODE_ALPHABET[0]!.repeat(TRACKED_LINK_CODE_LENGTH), base);
  }

  // D31: a visit keeps only an HMAC of the address and browser, never either value.
  async redirect(code: string, visitor: Visitor): Promise<string> {
    await this.limit(visitor.ip);
    const link = await this.repository.locate(code);
    if (!link) throw linkError('LINK_NOT_FOUND');
    const occurredAt = this.clock.now();
    const visitorHash = await this.visitorHash(link.storeId, visitor, occurredAt);
    return this.transaction.run(link.storeId, async () => {
      const tap = await this.repository.recordRedirectTap(link.storeId, link.trackedLinkId, {
        eventKey: newId(),
        occurredAt,
        visitorHash,
      });
      if (!tap) throw linkError('LINK_NOT_FOUND');
      if (tap.tapCount === 1)
        await this.outbox.publish({
          type: 'message.tapped',
          storeId: link.storeId,
          occurredAt: occurredAt.toISOString(),
          payload: {
            trackedLinkId: link.trackedLinkId,
            contactId: tap.contactId,
            sourceType: tap.sourceType,
            sourceId: tap.sourceId,
          },
        });
      return tap.targetUrl;
    });
  }

  // Opening the page changes nothing: phones fetch links to draw previews.
  async assertOptOutLink(code: string, ip: string): Promise<void> {
    await this.limit(ip);
    const link = await this.repository.locate(code);
    if (!link || !(await this.repository.findOptOutLink(link.storeId, link.trackedLinkId)))
      throw linkError('LINK_NOT_FOUND');
  }

  // A second tap finds the withdrawal already current and writes nothing.
  async optOut(code: string, ip: string): Promise<void> {
    await this.limit(ip);
    const link = await this.repository.locate(code);
    if (!link) throw linkError('LINK_NOT_FOUND');
    const { storeId, trackedLinkId } = link;
    await this.transaction.run(storeId, async () => {
      const optOut = await this.repository.lockOptOutLink(storeId, trackedLinkId);
      if (!optOut) throw linkError('LINK_NOT_FOUND');
      const [current] = await this.consent.current(storeId, [optOut.contactId], 'sms');
      if (current?.status === 'withdrawn') return;
      const consent = await this.consent.record(
        storeId,
        {
          contactId: optOut.contactId,
          channel: 'sms',
          status: 'withdrawn',
          source: 'opt_out_link',
          evidence: `SMS opt-out link ${trackedLinkId}`,
        },
        { kind: 'system' },
      );
      await this.outbox.publish({
        type: 'message.opted_out',
        storeId,
        occurredAt: consent.capturedAt,
        payload: { trackedLinkId, ...optOut },
      });
    });
  }

  private async limit(ip: string): Promise<void> {
    const key = `links:ip:${hashToken(ip).toString('hex')}`;
    if (!(await this.limiter.consume(key, TAPS_PER_IP_PER_MINUTE, 60)).allowed)
      throw linkError('LINK_RATE_LIMITED');
  }

  // The salt is random per Asia/Dhaka day and expires, so a day's hashes cannot be matched to
  // another day's or worked back to an address once it is gone. The store keeps shops apart.
  private async visitorHash(storeId: string, visitor: Visitor, at: Date): Promise<Buffer> {
    const salt = (await this.valkey.connection.eval(
      KEEP_FIRST_SALT,
      1,
      `links:visitor-salt:${dhakaDay.format(at)}`,
      randomBytes(32).toString('hex'),
      VISITOR_SALT_SECONDS,
    )) as string;
    return createHmac('sha256', salt)
      .update(JSON.stringify([storeId, visitor.ip, visitor.userAgent ?? '']))
      .digest();
  }
}

function newCode(): string {
  return Array.from(
    { length: TRACKED_LINK_CODE_LENGTH },
    () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)],
  ).join('');
}

function linkUrl(kind: NewTrackedLink['kind'], code: string, base: string): string {
  return kind === 'redirect' ? `${base}/${code}` : `${base}/s/${code}`;
}
