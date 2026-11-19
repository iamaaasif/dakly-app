import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, lt, ne, sql } from 'drizzle-orm';

import type { ChannelConnectionListQuery } from '@dakly/contracts/channels';
import type { Database } from '@dakly/db/client';
import { channelConnections } from '@dakly/db/schema/channels';

import { DATABASE } from '../platform/database/database.tokens';
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
  constructor(
    @Inject(TenantDatabase) private readonly database: TenantDatabase,
    @Inject(DATABASE) private readonly globalDatabase: Database,
  ) {}

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

  saveMeta(storeId: string, account: MetaConnection, now: Date) {
    return this.database.forStore(storeId, async (tx) => {
      const [inserted] = await tx
        .insert(channelConnections)
        .values({ ...account, storeId, connectedAt: now, createdAt: now, updatedAt: now })
        .onConflictDoNothing()
        .returning({ id: channelConnections.id });
      if (inserted) return { ...inserted, connected: true };

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
      return { id: existing.id, connected: existing.status !== 'active' };
    });
  }

  async expiringBefore(before: Date) {
    const result = await this.globalDatabase.execute<{
      storeId: string;
      channelConnectionId: string;
    }>(sql`
      select store_id as "storeId", channel_connection_id as "channelConnectionId"
      from channel_connections_expiring_before(${before.toISOString()}::timestamptz)
    `);
    return result.rows;
  }

  async activeMetaToken(storeId: string, id: string) {
    const [token] = await this.database.forStore(storeId, (tx) =>
      tx
        .select({
          ciphertext: channelConnections.accessTokenCiphertext,
          keyVersion: channelConnections.keyVersion,
          expiresAt: channelConnections.tokenExpiresAt,
        })
        .from(channelConnections)
        .where(
          and(
            eq(channelConnections.storeId, storeId),
            eq(channelConnections.id, id),
            eq(channelConnections.status, 'active'),
            inArray(channelConnections.kind, ['facebook_page', 'instagram']),
          ),
        ),
    );
    return token;
  }

  async markNeedsReconnect(storeId: string, id: string, now: Date) {
    await this.database.forStore(storeId, (tx) =>
      tx
        .update(channelConnections)
        .set({ status: 'needs_reconnect', updatedAt: now })
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
