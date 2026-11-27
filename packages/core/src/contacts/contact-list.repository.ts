import { Inject, Injectable } from '@nestjs/common';
import { and, count, eq, isNull, sql } from 'drizzle-orm';

import type {
  ConsentChannel,
  ContactListQuery,
  ContactSource,
  LifecycleStage,
} from '@dakly/contracts/contacts';
import { contactConsentCurrent } from '@dakly/db/schema/consents';
import { contacts, contactStats } from '@dakly/db/schema/contacts';

import { TenantDatabase } from '../platform/database/tenant-database';
import {
  cursorCondition,
  isHighValue,
  listOrdering,
  matchingConditions,
  statsConditions,
} from './contact-filters.repository';
import { type Contact, contactColumns } from './contacts.repository';

// A list row carries the columns the Columns picker can show.
export type ListedContact = Contact & {
  whatsappPhone: string | null;
  email: string | null;
  district: string | null;
  source: ContactSource;
  consentedChannels: ConsentChannel[];
  ordersCount: number;
  netSpendPoisha: number;
  lastOrderAt: Date | null;
  lifecycleStage: LifecycleStage;
  isHighValue: boolean;
};

export type ContactCountsRow = {
  all: number;
  new: number;
  returning: number;
  vip: number;
  inactive: number;
  atRisk: number;
  highValue: number;
  boughtMoreThanOnce: number;
  canReceiveMarketing: number;
};

// The service decides what a search means; each search field has its own index.
export type ContactFilter = Omit<ContactListQuery, 'search' | 'sort'> & {
  sort?: ContactListQuery['sort'];
  name?: string;
  matchEmailAndArea?: boolean;
  phone?: string;
  phonePrefix?: string;
};

@Injectable()
export class ContactListRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  list(storeId: string, filter: ContactFilter): Promise<ListedContact[]> {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select({
          ...contactColumns,
          whatsappPhone: contacts.whatsappPhone,
          email: contacts.email,
          district: contacts.district,
          source: contacts.source,
          consentedChannels: sql<ConsentChannel[]>`coalesce(array(
            select ${contactConsentCurrent.channel} from ${contactConsentCurrent}
            where ${contactConsentCurrent.storeId} = ${storeId}
              and ${contactConsentCurrent.contactId} = ${contacts.id}
              and ${contactConsentCurrent.status} = 'granted'
            order by ${contactConsentCurrent.channel}
          ), '{}')`,
          ordersCount: sql<number>`coalesce(${contactStats.ordersCount}, 0)`,
          netSpendPoisha: sql`coalesce(${contactStats.netSpendPoisha}, 0)`.mapWith(Number),
          lastOrderAt: contactStats.lastOrderAt,
          lifecycleStage: sql<LifecycleStage>`coalesce(${contactStats.lifecycleStage}, 'none')`,
          isHighValue,
        })
        .from(contacts)
        .leftJoin(
          contactStats,
          and(eq(contactStats.storeId, contacts.storeId), eq(contactStats.contactId, contacts.id)),
        )
        .where(
          and(
            ...matchingConditions(storeId, filter),
            ...statsConditions(filter),
            cursorCondition(storeId, filter.cursor, filter.sort ?? 'newest'),
          ),
        )
        .orderBy(...listOrdering(filter.sort ?? 'newest'))
        .limit(filter.limit + 1),
    );
  }

  async countListed(storeId: string, filter: ContactFilter): Promise<number> {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .select({ count: count() })
        .from(contacts)
        .leftJoin(
          contactStats,
          and(eq(contactStats.storeId, contacts.storeId), eq(contactStats.contactId, contacts.id)),
        )
        .where(and(...matchingConditions(storeId, filter), ...statsConditions(filter))),
    );
    return row!.count;
  }

  async counts(storeId: string): Promise<ContactCountsRow> {
    const inStage = (stage: LifecycleStage) =>
      sql<number>`(count(*) filter (where ${contactStats.lifecycleStage} = ${stage}))::int`;
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .select({
          all: sql<number>`count(*)::int`,
          new: inStage('new'),
          returning: inStage('regulars'),
          vip: inStage('best'),
          inactive: inStage('stopped_buying'),
          atRisk: inStage('slipping_away'),
          highValue: sql<number>`(count(*) filter (where ${isHighValue}))::int`,
          boughtMoreThanOnce: sql<number>`(count(*) filter (where ${contactStats.ordersCount} >= 2))::int`,
          canReceiveMarketing: sql<number>`(count(*) filter (where exists (
            select 1 from ${contactConsentCurrent}
            where ${contactConsentCurrent.storeId} = ${contacts.storeId}
              and ${contactConsentCurrent.contactId} = ${contacts.id}
              and ${contactConsentCurrent.status} = 'granted'
          )))::int`,
        })
        .from(contacts)
        .leftJoin(
          contactStats,
          and(eq(contactStats.storeId, contacts.storeId), eq(contactStats.contactId, contacts.id)),
        )
        .where(and(eq(contacts.storeId, storeId), isNull(contacts.deletedAt))),
    );
    return row!;
  }
}
