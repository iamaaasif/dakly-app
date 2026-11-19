import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, lt, ne, sql } from 'drizzle-orm';

import type { ChannelConnectionListQuery } from '@dakly/contracts/channels';
import { channelConnections } from '@dakly/db/schema/channels';

import { TenantDatabase } from '../platform/database/tenant-database';

type Connection = typeof channelConnections.$inferInsert;
type MetaConnection = Pick<
  Connection,
  | 'kind'
  | 'externalAccountId'
  | 'displayName'
  | 'accessTokenCiphertext'
  | 'keyVersion'
  | 'connectedByUserId'
>;

const connectionFields = {
  id: channelConnections.id,
  kind: channelConnections.kind,
  displayName: channelConnections.displayName,
  externalAccountId: channelConnections.externalAccountId,
  status: channelConnections.status,
  tokenExpiresAt: channelConnections.tokenExpiresAt,
  connectedAt: channelConnections.connectedAt,
  disconnectedAt: channelConnections.disconnectedAt,
};

@Injectable()
export class ChannelConnectionsRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  list(storeId: string, { cursor, limit }: ChannelConnectionListQuery) {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select(connectionFields)
        .from(channelConnections)
        .where(
          and(
            eq(channelConnections.storeId, storeId),
            cursor ? lt(channelConnections.id, cursor) : undefined,
          ),
        )
        .orderBy(desc(channelConnections.id))
        .limit(limit + 1),
    );
  }

  async hasForeignOwner(
    storeId: string,
    accounts: Pick<MetaConnection, 'kind' | 'externalAccountId'>[],
  ) {
    const values = sql.join(
      accounts.map(
        ({ kind, externalAccountId }) => sql`(${kind}::text, ${externalAccountId}::text)`,
      ),
      sql`, `,
    );
    const result = await this.database.forStore(storeId, (tx) =>
      tx.execute<{ conflict: boolean }>(sql`
        select exists (
          select 1 from (values ${values}) as accounts(kind, external_id)
          where store_id_for_channel_account(kind, external_id) <> ${storeId}::uuid
        ) as conflict
      `),
    );
    return result.rows[0]?.conflict ?? false;
  }

  async findInbound(
    storeId: string,
    { kind, externalAccountId }: Pick<MetaConnection, 'kind' | 'externalAccountId'>,
  ) {
    const [connection] = await this.database.forStore(storeId, (tx) =>
      tx
        .select({
          id: channelConnections.id,
          kind: channelConnections.kind,
          connectedAt: channelConnections.connectedAt,
        })
        .from(channelConnections)
        .where(
          and(
            eq(channelConnections.storeId, storeId),
            ne(channelConnections.status, 'disconnected'),
            eq(channelConnections.kind, kind),
            eq(channelConnections.externalAccountId, externalAccountId),
          ),
        )
        // Let disconnect wait for accepted deliveries without blocking other readers.
        .for('share'),
    );
    return connection;
  }

  saveMeta(storeId: string, account: MetaConnection, now: Date) {
    return this.database.forStore(storeId, async (tx) => {
      const [inserted] = await tx
        .insert(channelConnections)
        .values({ ...account, storeId, connectedAt: now, createdAt: now, updatedAt: now })
        .onConflictDoNothing()
        .returning({ id: channelConnections.id });
      if (inserted) return { ...inserted, connected: true, created: true };

      const [existing] = await tx
        .select({ id: channelConnections.id, status: channelConnections.status })
        .from(channelConnections)
        .where(
          and(
            eq(channelConnections.storeId, storeId),
            eq(channelConnections.kind, account.kind),
            eq(channelConnections.externalAccountId, account.externalAccountId),
            ne(channelConnections.status, 'disconnected'),
          ),
        )
        .for('update');
      if (!existing) return undefined;

      await tx
        .update(channelConnections)
        .set({ ...account, status: 'active', tokenExpiresAt: null, updatedAt: now })
        .where(
          and(eq(channelConnections.storeId, storeId), eq(channelConnections.id, existing.id)),
        );
      return { id: existing.id, connected: existing.status !== 'active', created: false };
    });
  }

  async stampConnectionStart(storeId: string, id: string, connectedAt: Date): Promise<void> {
    await this.database.forStore(storeId, (tx) =>
      tx
        .update(channelConnections)
        .set({ connectedAt })
        .where(and(eq(channelConnections.storeId, storeId), eq(channelConnections.id, id))),
    );
  }

  async disconnect(storeId: string, id: string, now: Date): Promise<boolean> {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .update(channelConnections)
        .set({
          status: 'disconnected',
          accessTokenCiphertext: null,
          keyVersion: null,
          tokenExpiresAt: null,
          disconnectedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(channelConnections.storeId, storeId),
            eq(channelConnections.id, id),
            ne(channelConnections.status, 'disconnected'),
          ),
        )
        .returning({ id: channelConnections.id }),
    );
    return rows.length > 0;
  }
}
