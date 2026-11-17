import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';

import type { ConsentChannel, ConsentSource, ConsentStatus } from '@dakly/contracts/contacts';
import { contactConsentCurrent } from '@dakly/db/schema/consents';
import { consents } from '@dakly/db/schema/contacts';

import { TenantDatabase } from '../platform/database/tenant-database';

export type Consent = {
  id: string;
  contactId: string;
  channel: ConsentChannel;
  status: ConsentStatus;
  source: ConsentSource;
  capturedAt: Date;
};

export type NewConsent = Omit<Consent, 'id'> & {
  evidence: string | null;
  capturedByUserId: string | null;
};

type CurrentConsent = Pick<Consent, 'contactId' | 'status' | 'source' | 'capturedAt'>;

const consentColumns = {
  id: consents.id,
  contactId: consents.contactId,
  channel: consents.channel,
  status: consents.status,
  source: consents.source,
  capturedAt: consents.capturedAt,
};

@Injectable()
export class ConsentsRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  async insert(storeId: string, consent: NewConsent): Promise<Consent> {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .insert(consents)
        .values({ storeId, ...consent })
        .returning(consentColumns),
    );
    return rows[0]!;
  }

  async insertAll(storeId: string, rows: NewConsent[]): Promise<Consent[]> {
    if (rows.length === 0) return [];
    return this.database.forStore(storeId, (tx) =>
      tx
        .insert(consents)
        .values(rows.map((consent) => ({ storeId, ...consent })))
        .returning(consentColumns),
    );
  }

  listCurrent(
    storeId: string,
    contactIds: string[],
    channel: ConsentChannel,
  ): Promise<CurrentConsent[]> {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select({
          contactId: contactConsentCurrent.contactId,
          status: contactConsentCurrent.status,
          source: contactConsentCurrent.source,
          capturedAt: contactConsentCurrent.capturedAt,
        })
        .from(contactConsentCurrent)
        .where(
          and(
            eq(contactConsentCurrent.storeId, storeId),
            eq(contactConsentCurrent.channel, channel),
            inArray(contactConsentCurrent.contactId, contactIds),
          ),
        ),
    );
  }
}
