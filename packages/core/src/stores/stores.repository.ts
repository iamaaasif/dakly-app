import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import type {
  CreateStoreInput,
  StoreResponse,
  StoreSettingsResponse,
  ChangeStoreSettingsInput,
} from '@dakly/contracts/stores';
import { stores, storeCounters } from '@dakly/db/schema/stores';

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
  async find(storeId: string): Promise<StoreResponse | undefined> {
    const [row] = await this.tenant.forStore(storeId, (tx) =>
      tx.select(storeColumns).from(stores).where(eq(stores.id, storeId)).limit(1),
    );
    return row;
  }
  async settings(storeId: string): Promise<StoreSettingsResponse | undefined> {
    const [row] = await this.tenant.forStore(storeId, (tx) =>
      tx.select(settingsColumns).from(stores).where(eq(stores.id, storeId)).limit(1),
    );
    return row;
  }
  async changeSettings(
    storeId: string,
    input: ChangeStoreSettingsInput,
    updatedAt: Date,
  ): Promise<StoreSettingsResponse | undefined> {
    const [row] = await this.tenant.forStore(storeId, (tx) =>
      tx
        .update(stores)
        .set({ ...input, updatedAt })
        .where(eq(stores.id, storeId))
        .returning(settingsColumns),
    );
    return row;
  }
  async changeExtensions(
    storeId: string,
    extensions: string[],
    updatedAt: Date,
  ): Promise<StoreSettingsResponse | undefined> {
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
