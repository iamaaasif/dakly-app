import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, lte } from 'drizzle-orm';

import { ownershipTransfers } from '@dakly/db/schema/team';

import { TenantDatabase } from '../platform/database/tenant-database';

const transferColumns = {
  id: ownershipTransfers.id,
  ownerUserId: ownershipTransfers.ownerUserId,
  newOwnerUserId: ownershipTransfers.newOwnerUserId,
  status: ownershipTransfers.status,
  expiresAt: ownershipTransfers.expiresAt,
};
export type OwnershipTransfer = Pick<
  typeof ownershipTransfers.$inferSelect,
  keyof typeof transferColumns
>;
@Injectable()
export class OwnershipTransferRepository {
  constructor(@Inject(TenantDatabase) private readonly tenant: TenantDatabase) {}
  async current(storeId: string, now: Date): Promise<OwnershipTransfer | undefined> {
    const [row] = await this.tenant.forStore(storeId, (tx) =>
      tx
        .select(transferColumns)
        .from(ownershipTransfers)
        .where(
          and(
            eq(ownershipTransfers.storeId, storeId),
            eq(ownershipTransfers.status, 'pending'),
            gt(ownershipTransfers.expiresAt, now),
          ),
        )
        .limit(1),
    );
    return row;
  }

  async find(storeId: string, transferId: string): Promise<OwnershipTransfer | undefined> {
    const [row] = await this.tenant.forStore(storeId, (tx) =>
      tx
        .select(transferColumns)
        .from(ownershipTransfers)
        .where(and(eq(ownershipTransfers.storeId, storeId), eq(ownershipTransfers.id, transferId)))
        .limit(1),
    );
    return row;
  }

  async expire(storeId: string, now: Date): Promise<void> {
    await this.tenant.forStore(storeId, (tx) =>
      tx
        .update(ownershipTransfers)
        .set({ status: 'expired', updatedAt: now })
        .where(
          and(
            eq(ownershipTransfers.storeId, storeId),
            eq(ownershipTransfers.status, 'pending'),
            lte(ownershipTransfers.expiresAt, now),
          ),
        ),
    );
  }

  async insert(
    storeId: string,
    ownerUserId: string,
    newOwnerUserId: string,
    expiresAt: Date,
  ): Promise<OwnershipTransfer> {
    const [row] = await this.tenant.forStore(storeId, (tx) =>
      tx
        .insert(ownershipTransfers)
        .values({ storeId, ownerUserId, newOwnerUserId, expiresAt, status: 'pending' })
        .returning(transferColumns),
    );
    return row!;
  }

  async finish(
    storeId: string,
    transferId: string,
    status: 'accepted' | 'cancelled',
    now: Date,
  ): Promise<OwnershipTransfer> {
    const [row] = await this.tenant.forStore(storeId, (tx) =>
      tx
        .update(ownershipTransfers)
        .set({ status, updatedAt: now })
        .where(and(eq(ownershipTransfers.storeId, storeId), eq(ownershipTransfers.id, transferId)))
        .returning(transferColumns),
    );
    return row!;
  }
}
