import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, lte, sql } from 'drizzle-orm';

import { users } from '@dakly/db/schema/auth';
import { ownershipTransfers } from '@dakly/db/schema/team';

import { TenantDatabase } from '../platform/database/tenant-database';

// Correlated subqueries rather than a join, so insert and update return the recipient in the same statement.
const recipientUser = <T>(column: typeof users.name | typeof users.phone) =>
  sql<T>`(select ${column} from ${users} where ${users.id} = ${ownershipTransfers.newOwnerUserId})`;
const transferColumns = {
  id: ownershipTransfers.id,
  ownerUserId: ownershipTransfers.ownerUserId,
  newOwnerUserId: ownershipTransfers.newOwnerUserId,
  status: ownershipTransfers.status,
  expiresAt: ownershipTransfers.expiresAt,
  recipientName: recipientUser<string>(users.name),
  recipientPhone: recipientUser<string | null>(users.phone),
};
export type OwnershipTransfer = Pick<
  typeof ownershipTransfers.$inferSelect,
  'id' | 'ownerUserId' | 'newOwnerUserId' | 'status' | 'expiresAt'
> & { recipientName: string; recipientPhone: string | null };
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
