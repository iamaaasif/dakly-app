import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm';

import type { SmsSenderIdStatus } from '@dakly/contracts/sms-senders';
import type { Database } from '@dakly/db/client';
import { smsSenderIds } from '@dakly/db/schema/channels';

import { DATABASE } from '../platform/database/database.tokens';
import { isConstraintViolation } from '../platform/database/error-code';
import { TenantDatabase } from '../platform/database/tenant-database';

const senderColumns = {
  id: smsSenderIds.id,
  senderName: smsSenderIds.senderName,
  status: smsSenderIds.status,
  rejectionReason: smsSenderIds.rejectionReason,
  createdAt: smsSenderIds.createdAt,
  decidedAt: smsSenderIds.decidedAt,
};
export type SmsSender = {
  [Key in keyof typeof senderColumns]: (typeof smsSenderIds.$inferSelect)[Key];
};
export type SmsSenderDecision = {
  status: 'approved' | 'rejected';
  rejectionReason: string | null;
  decidedAt: Date;
};
// Raw queries return timestamps in Postgres text form, not ISO 8601.
export type OpenSmsSender = Pick<SmsSender, 'id' | 'senderName' | 'status'> & {
  storeId: string;
  storeName: string;
  createdAt: string;
};

@Injectable()
export class SmsSendersRepository {
  constructor(
    @Inject(TenantDatabase) private readonly database: TenantDatabase,
    @Inject(DATABASE) private readonly connection: Database,
  ) {}

  // Undefined when the store already has a sender that is not rejected.
  async insert(
    storeId: string,
    senderName: string,
    requestedByUserId: string,
  ): Promise<SmsSender | undefined> {
    try {
      const [row] = await this.database.forStore(storeId, (tx) =>
        tx
          .insert(smsSenderIds)
          .values({ storeId, senderName, requestedByUserId })
          .returning(senderColumns),
      );
      return row;
    } catch (error) {
      if (isConstraintViolation(error, '23505', 'sms_sender_ids_store_id_active_key'))
        return undefined;
      throw error;
    }
  }

  list(storeId: string, page: { cursor?: string; limit: number }): Promise<SmsSender[]> {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select(senderColumns)
        .from(smsSenderIds)
        .where(
          and(
            eq(smsSenderIds.storeId, storeId),
            page.cursor ? lt(smsSenderIds.id, page.cursor) : undefined,
          ),
        )
        .orderBy(desc(smsSenderIds.id))
        .limit(page.limit + 1),
    );
  }

  async findById(storeId: string, id: string): Promise<SmsSender | undefined> {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .select(senderColumns)
        .from(smsSenderIds)
        .where(and(eq(smsSenderIds.storeId, storeId), eq(smsSenderIds.id, id)))
        .limit(1),
    );
    return row;
  }

  async findApprovedName(storeId: string): Promise<string | undefined> {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .select({ senderName: smsSenderIds.senderName })
        .from(smsSenderIds)
        .where(and(eq(smsSenderIds.storeId, storeId), eq(smsSenderIds.status, 'approved')))
        .limit(1),
    );
    return row?.senderName;
  }

  // Changes the row only while it is still in one of the given statuses.
  async decide(
    storeId: string,
    id: string,
    from: readonly SmsSenderIdStatus[],
    decision: SmsSenderDecision,
  ): Promise<SmsSender | undefined> {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .update(smsSenderIds)
        .set(decision)
        .where(
          and(
            eq(smsSenderIds.storeId, storeId),
            eq(smsSenderIds.id, id),
            inArray(smsSenderIds.status, [...from]),
          ),
        )
        .returning(senderColumns),
    );
    return row;
  }

  // Staff read across stores through the definer function, never with row security off.
  async listOpen(page: { cursor?: string; limit: number }): Promise<OpenSmsSender[]> {
    const { rows } = await this.connection.execute<OpenSmsSender>(
      sql`select id, store_id as "storeId", store_name as "storeName", sender_name as "senderName",
        status, created_at as "createdAt"
        from open_sms_sender_ids(${page.cursor ?? null}::uuid, ${page.limit + 1})`,
    );
    return rows;
  }
}
