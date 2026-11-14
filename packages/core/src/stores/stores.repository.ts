import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { stores, storeCounters } from '@dakly/db/schema/stores';
import type { CreateStoreInput, StoreResponse } from '@dakly/contracts/stores';
import { TenantDatabase } from '../platform/database/tenant-database';
const storeColumns = {
  id: stores.id,
  name: stores.name,
  slug: stores.slug,
  extensions: stores.extensions,
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
}
