import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gt, inArray, isNotNull, sql } from 'drizzle-orm';

import type { CampaignOutcome } from '@dakly/contracts/campaigns';
import { campaignRecipients, campaigns } from '@dakly/db/schema/campaigns';
import { contactConsentCurrent } from '@dakly/db/schema/consents';
import { contacts } from '@dakly/db/schema/contacts';

import { TenantDatabase } from '../platform/database/tenant-database';

export type RecipientOutcome = Exclude<CampaignOutcome, 'ordered'>;

const { storeId, campaignId, contactId, status, errorCode } = campaignRecipients;

// The opt-out link withdraws SMS consent; only a withdrawal after the send counts.
const optedOut = (store: string) =>
  and(
    eq(contactConsentCurrent.storeId, store),
    eq(contactConsentCurrent.contactId, contactId),
    eq(contactConsentCurrent.channel, 'sms'),
    eq(contactConsentCurrent.status, 'withdrawn'),
    eq(contactConsentCurrent.source, 'opt_out_link'),
    sql`${contactConsentCurrent.capturedAt} >= ${campaignRecipients.sentAt}`,
  );

@Injectable()
export class CampaignResultsRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  async findSummary(store: string, id: string) {
    const [row] = await this.database.forStore(store, (tx) =>
      tx
        .select({
          channel: campaigns.channel,
          costPoisha: campaigns.actualCostPoisha,
          finishedAt: campaigns.finishedAt,
        })
        .from(campaigns)
        .where(and(eq(campaigns.storeId, store), eq(campaigns.id, id)))
        .limit(1),
    );
    return row;
  }

  failureReasons(store: string, id: string) {
    return this.database.forStore(store, (tx) =>
      tx
        .select({
          code: sql<string>`coalesce(${errorCode}, 'unknown')`,
          count: sql<number>`count(*)::int`,
        })
        .from(campaignRecipients)
        .where(and(eq(storeId, store), eq(campaignId, id), eq(status, 'failed')))
        .groupBy(sql`1`)
        .orderBy(sql`2 desc`, sql`1`),
    );
  }

  // Failed people with a phone and a current SMS grant, for the "send by SMS" count.
  async smsFallbackCount(store: string, id: string): Promise<number> {
    const [row] = await this.database.forStore(store, (tx) =>
      tx
        .select({ count: sql<number>`count(*)::int` })
        .from(campaignRecipients)
        .innerJoin(
          contacts,
          and(eq(contacts.storeId, store), eq(contacts.id, contactId), isNotNull(contacts.phone)),
        )
        .innerJoin(
          contactConsentCurrent,
          and(
            eq(contactConsentCurrent.storeId, store),
            eq(contactConsentCurrent.contactId, contactId),
            eq(contactConsentCurrent.channel, 'sms'),
            eq(contactConsentCurrent.status, 'granted'),
          ),
        )
        .where(and(eq(storeId, store), eq(campaignId, id), eq(status, 'failed'))),
    );
    return row?.count ?? 0;
  }

  async optedOutCount(store: string, id: string): Promise<number> {
    const [row] = await this.database.forStore(store, (tx) =>
      tx
        .select({ count: sql<number>`count(*)::int` })
        .from(campaignRecipients)
        .innerJoin(contactConsentCurrent, optedOut(store))
        .where(and(eq(storeId, store), eq(campaignId, id))),
    );
    return row?.count ?? 0;
  }

  // Recipient ids are time-ordered, so paging by id is stable.
  customers(
    store: string,
    id: string,
    outcome: RecipientOutcome,
    { cursor, limit }: { cursor?: string; limit: number },
  ) {
    const at = {
      tapped: campaignRecipients.tappedAt,
      read: campaignRecipients.readAt,
      delivered: sql`coalesce(${campaignRecipients.deliveredAt}, ${campaignRecipients.readAt})`,
      failed: campaignRecipients.failedAt,
      opted_out: contactConsentCurrent.capturedAt,
    }[outcome];
    const matches = {
      tapped: isNotNull(campaignRecipients.tappedAt),
      read: eq(status, 'read'),
      delivered: inArray(status, ['delivered', 'read']),
      failed: eq(status, 'failed'),
      opted_out: undefined,
    }[outcome];
    const query = this.database.forStore(store, (tx) => {
      const base = tx
        .select({
          id: campaignRecipients.id,
          contactId,
          name: contacts.name,
          at: sql<Date | null>`${at}`,
        })
        .from(campaignRecipients)
        .innerJoin(contacts, and(eq(contacts.storeId, store), eq(contacts.id, contactId)));
      const joined =
        outcome === 'opted_out' ? base.innerJoin(contactConsentCurrent, optedOut(store)) : base;
      return joined
        .where(
          and(
            eq(storeId, store),
            eq(campaignId, id),
            matches,
            cursor ? gt(campaignRecipients.id, cursor) : undefined,
          ),
        )
        .orderBy(asc(campaignRecipients.id))
        .limit(limit + 1);
    });
    return query;
  }
}
