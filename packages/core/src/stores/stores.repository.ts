import { Inject, Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';

import type {
  CreateStoreInput,
  SetupProfile,
  StoreResponse,
  StoreSettingsResponse,
  ChangeStoreSettingsInput,
} from '@dakly/contracts/stores';
import { stores, storeCounters } from '@dakly/db/schema/stores';

import type { Transaction } from '../platform/database/scoped-transactions';
import { TenantDatabase } from '../platform/database/tenant-database';

const storeColumns = {
  id: stores.id,
  name: stores.name,
  slug: stores.slug,
  extensions: stores.extensions,
};
const setupColumns = {
  businessType: stores.businessType,
  district: stores.district,
  howYouSell: stores.howYouSell,
  extensions: stores.extensions,
  guideHidden: sql<boolean>`coalesce((${stores.settings}->>'setupGuideHidden')::boolean, false)`,
};
const settingsColumns = {
  ...storeColumns,
  legalName: stores.legalName,
  businessType: stores.businessType,
  phone: stores.phone,
  email: stores.email,
  address: stores.address,
  district: stores.district,
  vatBin: stores.vatBin,
  tradeLicenceNumber: stores.tradeLicenceNumber,
  sending: sql<unknown>`${stores.settings}->'sending'`,
  stock: sql<unknown>`${stores.settings}->'stock'`,
  dueBook: sql<unknown>`${stores.settings}->'dueBook'`,
};

// The service parses the sending section and fills its defaults.
export type StoreSettingsRow = Omit<StoreSettingsResponse, 'sending' | 'stock' | 'dueBook'> & {
  sending: unknown;
  stock: unknown;
  dueBook: unknown;
};

export type AttributionRebuild = {
  id: string;
  timeZone: string;
  startedAt: string;
  after: { id: string; at: string } | null;
  processedOrders: number;
  checkpoint: string | null;
};

@Injectable()
export class StoresRepository {
  constructor(@Inject(TenantDatabase) private readonly tenant: TenantDatabase) {}

  async customerInactivityDays(storeId: string) {
    const [row] = await this.tenant.forStore(storeId, (tx) =>
      tx.select({ days: stores.customerInactivityDays }).from(stores).where(eq(stores.id, storeId)),
    );
    return row?.days;
  }

  async insert(storeId: string, input: CreateStoreInput, extensions: string[]): Promise<void> {
    await this.tenant.forStore(storeId, async (tx) => {
      await tx.insert(stores).values({
        id: storeId,
        name: input.name,
        slug: `s-${storeId.replaceAll('-', '')}`,
        businessType: input.businessType,
        district: input.district,
        websiteUrl: input.websiteUrl,
        offering: input.offering,
        howYouSell: input.howYouSell,
        onboardingCustomerCountRange: input.customerListSize,
        extensions,
      });
      await tx.insert(storeCounters).values({ storeId });
    });
  }

  async nextOrderNumber(storeId: string): Promise<number | undefined> {
    const [row] = await this.tenant.forStore(storeId, (tx) =>
      tx
        .update(storeCounters)
        .set({ nextOrderNumber: sql`${storeCounters.nextOrderNumber} + 1` })
        .where(eq(storeCounters.storeId, storeId))
        .returning({ number: sql<number>`${storeCounters.nextOrderNumber} - 1` }),
    );
    return row?.number;
  }

  async find(storeId: string): Promise<StoreResponse | undefined> {
    const [row] = await this.tenant.forStore(storeId, (tx) =>
      tx.select(storeColumns).from(stores).where(eq(stores.id, storeId)).limit(1),
    );
    return row;
  }

  async settings(storeId: string): Promise<StoreSettingsRow | undefined> {
    const [row] = await this.tenant.forStore(storeId, (tx) =>
      tx.select(settingsColumns).from(stores).where(eq(stores.id, storeId)).limit(1),
    );
    return row;
  }

  async lockedStatus(storeId: string) {
    const [store] = await this.tenant.forStore(storeId, (tx) =>
      tx.select({ status: stores.status }).from(stores).where(eq(stores.id, storeId)).for('share'),
    );
    return store?.status;
  }

  async attributionState(storeId: string) {
    const [row] = await this.tenant.forStore(storeId, (tx) =>
      tx
        .select({
          windowDays: stores.attributionWindowDays,
          timeZone: stores.timeZone,
          rebuild: sql<unknown>`${stores.settings}->'attributionRebuild'`,
        })
        .from(stores)
        .where(eq(stores.id, storeId)),
    );
    return row;
  }

  writeAttributionState(
    storeId: string,
    rebuild: AttributionRebuild | null,
    change?: { windowDays: number; updatedAt: Date },
  ) {
    const settings = rebuild
      ? sql`jsonb_set(${stores.settings}, '{attributionRebuild}', ${JSON.stringify(rebuild)}::jsonb)`
      : sql`${stores.settings} - 'attributionRebuild'`;
    return this.tenant.forStore(storeId, (tx) =>
      tx
        .update(stores)
        .set({
          settings,
          updatedAt: sql`${stores.updatedAt}`,
          ...(change && { attributionWindowDays: change.windowDays, updatedAt: change.updatedAt }),
        })
        .where(eq(stores.id, storeId)),
    );
  }

  async attributionWindowDays(storeId: string, lock?: 'share') {
    const [row] = await this.tenant.forStore(storeId, (tx) => {
      const query = tx
        .select({ days: stores.attributionWindowDays })
        .from(stores)
        .where(eq(stores.id, storeId));
      return lock ? query.for(lock) : query;
    });
    return row?.days;
  }

  async timeZone(storeId: string): Promise<string | undefined> {
    const [row] = await this.tenant.forStore(storeId, (tx) =>
      tx.select({ timeZone: stores.timeZone }).from(stores).where(eq(stores.id, storeId)).limit(1),
    );
    return row?.timeZone;
  }

  async sendingSettings(
    storeId: string,
    lock?: 'share',
  ): Promise<{ timeZone: string; sending: unknown } | undefined> {
    const read = (tx: Transaction) => {
      const query = tx
        .select({ timeZone: stores.timeZone, sending: sql<unknown>`${stores.settings}->'sending'` })
        .from(stores)
        .where(eq(stores.id, storeId))
        .limit(1);
      return lock ? query.for(lock) : query;
    };
    const [row] = lock
      ? await this.tenant.inTransaction(storeId, read)
      : await this.tenant.forStore(storeId, read);
    return row;
  }

  async changeSettings(
    storeId: string,
    { sending, stock, dueBook, ...columns }: ChangeStoreSettingsInput,
    updatedAt: Date,
  ): Promise<StoreSettingsRow | undefined> {
    const [row] = await this.tenant.forStore(storeId, (tx) => {
      let settings = sql`${stores.settings}`;
      if (sending)
        settings = sql`jsonb_set(${settings}, '{sending}', ${JSON.stringify(sending)}::jsonb)`;
      if (stock) settings = sql`jsonb_set(${settings}, '{stock}', ${JSON.stringify(stock)}::jsonb)`;
      if (dueBook)
        settings = sql`jsonb_set(${settings}, '{dueBook}', ${JSON.stringify(dueBook)}::jsonb)`;
      return tx
        .update(stores)
        .set({ ...columns, updatedAt, ...((sending || stock || dueBook) && { settings }) })
        .where(eq(stores.id, storeId))
        .returning(settingsColumns);
    });
    return row;
  }

  async changeExtensions(
    storeId: string,
    extensions: string[],
    updatedAt: Date,
  ): Promise<StoreSettingsRow | undefined> {
    const [row] = await this.tenant.forStore(storeId, (tx) =>
      tx
        .update(stores)
        .set({ extensions, updatedAt })
        .where(eq(stores.id, storeId))
        .returning(settingsColumns),
    );
    return row;
  }

  async setupProfile(storeId: string): Promise<SetupProfile | undefined> {
    const [row] = await this.tenant.forStore(storeId, (tx) =>
      tx.select(setupColumns).from(stores).where(eq(stores.id, storeId)).limit(1),
    );
    return row as SetupProfile | undefined;
  }

  async hideSetupGuide(storeId: string, updatedAt: Date): Promise<SetupProfile | undefined> {
    const [row] = await this.tenant.forStore(storeId, (tx) =>
      tx
        .update(stores)
        .set({
          updatedAt,
          settings: sql`jsonb_set(${stores.settings}, '{setupGuideHidden}', 'true'::jsonb)`,
        })
        .where(eq(stores.id, storeId))
        .returning(setupColumns),
    );
    return row as SetupProfile | undefined;
  }
}
