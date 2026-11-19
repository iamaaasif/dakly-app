import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, ne } from 'drizzle-orm';

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

  list(storeId: string) {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select(connectionFields)
        .from(channelConnections)
        .where(eq(channelConnections.storeId, storeId))
        .orderBy(desc(channelConnections.connectedAt), desc(channelConnections.id)),
    );
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
