import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import type { PlatformInterests } from '@dakly/contracts/social';
import { platformInterests } from '@dakly/db/schema/social';

import { TenantDatabase } from '../platform/database/tenant-database';

type Platform = PlatformInterests['platforms'][number];

@Injectable()
export class PlatformInterestRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  async platforms(storeId: string, userId: string) {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .select({ platform: platformInterests.platform })
        .from(platformInterests)
        .where(and(eq(platformInterests.storeId, storeId), eq(platformInterests.userId, userId))),
    );
    return rows.map(({ platform }) => platform);
  }

  async add(storeId: string, userId: string, platform: Platform) {
    await this.database.forStore(storeId, (tx) =>
      tx.insert(platformInterests).values({ storeId, userId, platform }).onConflictDoNothing(),
    );
  }

  async remove(storeId: string, userId: string, platform: Platform) {
    await this.database.forStore(storeId, (tx) =>
      tx
        .delete(platformInterests)
        .where(
          and(
            eq(platformInterests.storeId, storeId),
            eq(platformInterests.userId, userId),
            eq(platformInterests.platform, platform),
          ),
        ),
    );
  }
}
