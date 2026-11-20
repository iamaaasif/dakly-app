import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';

import type { Database } from '@dakly/db/client';
import { orderConfirmations } from '@dakly/db/schema/orders';

import { DATABASE } from '../platform/database/database.tokens';
import { newId } from '../platform/database/new-id';
import { TenantDatabase } from '../platform/database/tenant-database';

export type ConfirmationToken = {
  storeId: string;
  confirmationId: string;
  orderId: string;
  isUsed: boolean;
};

@Injectable()
export class OrderConfirmationRepository {
  constructor(
    @Inject(TenantDatabase) private readonly tenant: TenantDatabase,
    @Inject(DATABASE) private readonly database: Database,
  ) {}

  // A token left by a send that rolled back is harmless: nobody holds it.
  async insertToken(storeId: string, orderId: string, tokenHash: Buffer): Promise<void> {
    await this.tenant.forStore(storeId, (tx) =>
      tx.insert(orderConfirmations).values({ id: newId(), storeId, orderId, tokenHash }),
    );
  }

  // A link names no store, so a SECURITY DEFINER function finds the token by its hash.
  async locate(tokenHash: Buffer): Promise<ConfirmationToken | undefined> {
    const result = await this.database.execute<ConfirmationToken>(
      sql`select store_id as "storeId", confirmation_id as "confirmationId", order_id as "orderId",
        used_at is not null as "isUsed" from order_confirmation_for_token(${tokenHash})`,
    );
    return result.rows[0];
  }

  // False when a second tap got there first.
  async markUsed(storeId: string, confirmationId: string, usedAt: Date): Promise<boolean> {
    const rows = await this.tenant.forStore(storeId, (tx) =>
      tx
        .update(orderConfirmations)
        .set({ usedAt })
        .where(
          and(
            eq(orderConfirmations.storeId, storeId),
            eq(orderConfirmations.id, confirmationId),
            isNull(orderConfirmations.usedAt),
          ),
        )
        .returning({ id: orderConfirmations.id }),
    );
    return rows.length > 0;
  }
}
