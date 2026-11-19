import { Inject, Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';

import type {
  CreateStoreInput,
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
};

// The service parses the sending section and fills its defaults.
export type StoreSettingsRow = Omit<StoreSettingsResponse, 'sending' | 'stock'> & {
  sending: unknown;
  stock: unknown;
};

@Injectable()
export class StoresRepository {
  constructor(@Inject(TenantDatabase) private readonly tenant: TenantDatabase) {}
  async insert(storeId: string, input: CreateStoreInput, extensions: string[]): Promise<void> {
    await this.tenant.forStore(storeId, async (tx) => {
      await tx.insert(stores).values({
        id: storeId,
        name: input.name,
        slug: `s-${storeId.replaceAll('-', '')}`,
        businessType: input.businessType,
        district: input.district,
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
    { sending, stock, ...columns }: ChangeStoreSettingsInput,
    updatedAt: Date,
  ): Promise<StoreSettingsRow | undefined> {
    const [row] = await this.tenant.forStore(storeId, (tx) => {
      let settings = sql`${stores.settings}`;
      if (sending)
        settings = sql`jsonb_set(${settings}, '{sending}', ${JSON.stringify(sending)}::jsonb)`;
      if (stock) settings = sql`jsonb_set(${settings}, '{stock}', ${JSON.stringify(stock)}::jsonb)`;
      return tx
        .update(stores)
        .set({ ...columns, updatedAt, ...((sending || stock) && { settings }) })
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
}
