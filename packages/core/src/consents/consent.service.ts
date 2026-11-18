import { Inject, Injectable } from '@nestjs/common';

import type { AuditEntry } from '@dakly/contracts/audit';
import type {
  ConsentChannel,
  ConsentResponse,
  RecordConsentInput,
} from '@dakly/contracts/contacts';
import type { DaklyEvent } from '@dakly/contracts/events/dakly-event';

import { ContactsService } from '../contacts/contacts.service';
import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { OutboxService } from '../platform/outbox/outbox.service';
import {
  consentError,
  MAX_AUDIENCE_CONSENT_CONTACTS,
  MAX_CONSENT_CONTACTS,
} from './consents.errors';
import { type Consent, ConsentsRepository, type NewConsent } from './consents.repository';

type RecordConsentChange = Pick<
  NewConsent,
  'contactId' | 'channel' | 'status' | 'source' | 'evidence'
>;

const STAFF_OPT_IN_CHANNELS: ConsentChannel[] = ['whatsapp', 'sms'];

@Injectable()
export class ConsentService {
  static readonly AUDIENCE_LIMIT = MAX_AUDIENCE_CONSENT_CONTACTS;

  constructor(
    @Inject(ConsentsRepository) private readonly repository: ConsentsRepository,
    @Inject(ContactsService) private readonly contacts: ContactsService,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  // Consent history is evidence: every answer is a new row, and the latest row per channel wins.
  record(
    storeId: string,
    change: RecordConsentChange,
    actor: AuditEntry['actor'],
  ): Promise<ConsentResponse> {
    return this.transaction.run(storeId, async () => {
      await this.contacts.lockForConsent(storeId, [change.contactId]);
      const capturedAt = this.clock.now();
      const consent = await this.repository.insert(storeId, {
        ...change,
        capturedAt,
        capturedByUserId: actor.kind === 'user' ? actor.userId : null,
      });
      await this.outbox.publish(consentChangedEvent(storeId, consent));
      return toConsentResponse(consent);
    });
  }

  // Staff type how the customer agreed or refused; that note is the evidence.
  async recordStaffAnswer(
    storeId: string,
    contactId: string,
    { channel, status, note }: RecordConsentInput,
    actor: AuditEntry['actor'],
  ): Promise<ConsentResponse> {
    // A Messenger or Instagram opt-in must come from the customer, so a staff note cannot grant it.
    if (status === 'granted' && !STAFF_OPT_IN_CHANNELS.includes(channel))
      throw consentError('CONSENT_OPT_IN_NEEDS_CUSTOMER');
    return this.record(
      storeId,
      { contactId, channel, status, source: 'manual', evidence: note },
      actor,
    );
  }

  // A contact with no row has never answered on this channel and is not in the result.
  current(storeId: string, contactIds: string[], channel: ConsentChannel) {
    if (contactIds.length > MAX_CONSENT_CONTACTS) throw consentError('CONSENT_CONTACTS_TOO_MANY');
    return this.repository.listCurrent(storeId, contactIds, channel);
  }

  // D42 and CUS-R4: the shop's evidence grants a channel only to contacts with no answer on it. A
  // contact already granted gets no new row, so a rerun records nothing; one who withdrew is never
  // granted again and is returned for the import report.
  async grantFromImport(
    storeId: string,
    grant: { contactIds: string[]; channel: ConsentChannel; evidence: string; importId: string },
    actor: AuditEntry['actor'],
  ): Promise<{ withdrawnContactIds: string[] }> {
    if (grant.contactIds.length > MAX_AUDIENCE_CONSENT_CONTACTS)
      throw consentError('CONSENT_AUDIENCE_TOO_MANY');
    return this.transaction.run(storeId, async () => {
      await this.contacts.lockForConsent(storeId, grant.contactIds);
      const current = await this.repository.listCurrent(storeId, grant.contactIds, grant.channel);
      const answered = new Map(
        current
          .filter((consent) => consent.status !== 'not_answered')
          .map((consent) => [consent.contactId, consent.status]),
      );
      const capturedAt = this.clock.now();
      const granted = await this.repository.insertAll(
        storeId,
        grant.contactIds
          .filter((contactId) => !answered.has(contactId))
          .map((contactId) => ({
            contactId,
            channel: grant.channel,
            status: 'granted' as const,
            source: 'import' as const,
            evidence: grant.evidence,
            importId: grant.importId,
            capturedAt,
            capturedByUserId: actor.kind === 'user' ? actor.userId : null,
          })),
      );
      await this.outbox.publishAll(granted.map((consent) => consentChangedEvent(storeId, consent)));
      return {
        withdrawnContactIds: current
          .filter((consent) => consent.status === 'withdrawn')
          .map((consent) => consent.contactId),
      };
    });
  }

  async restoreImportGrants(
    storeId: string,
    importId: string,
    after: string | undefined,
    actor: AuditEntry['actor'],
  ): Promise<{ after?: string; complete: boolean }> {
    return this.transaction.run(storeId, async () => {
      const grants = await this.repository.listImportGrants(storeId, importId, after);
      if (grants.length === 0) return { after, complete: true };
      await this.contacts.lockConsentHistory(storeId, [
        ...new Set(grants.map((row) => row.contactId)),
      ]);
      const unchanged = await this.repository.listUnchangedGrants(
        storeId,
        grants.map((row) => row.id),
      );
      const capturedAt = this.clock.now();
      const restored = await this.repository.insertAll(
        storeId,
        unchanged.map((row) => ({
          contactId: row.contactId,
          channel: row.channel,
          status: 'not_answered',
          source: 'import',
          evidence: `Import ${importId} undone`,
          capturedAt,
          capturedByUserId: actor.kind === 'user' ? actor.userId : null,
        })),
      );
      await this.outbox.publishAll(restored.map((row) => consentChangedEvent(storeId, row)));
      return { after: grants.at(-1)!.id, complete: grants.length < MAX_AUDIENCE_CONSENT_CONTACTS };
    });
  }

  currentForAudience(storeId: string, contactIds: string[], channel: ConsentChannel) {
    if (contactIds.length > MAX_AUDIENCE_CONSENT_CONTACTS)
      throw consentError('CONSENT_AUDIENCE_TOO_MANY');
    return this.repository.listCurrent(storeId, contactIds, channel);
  }
}

function consentChangedEvent(storeId: string, consent: Consent): DaklyEvent {
  return {
    type: 'consent.changed',
    storeId,
    occurredAt: consent.capturedAt.toISOString(),
    payload: {
      consentId: consent.id,
      contactId: consent.contactId,
      channel: consent.channel,
      status: consent.status,
      source: consent.source,
    },
  };
}

function toConsentResponse(consent: Consent): ConsentResponse {
  return { ...consent, capturedAt: consent.capturedAt.toISOString() };
}
