import { Inject, Injectable } from '@nestjs/common';

import type { ChannelConnection, ChannelConnectionListQuery } from '@dakly/contracts/channels';
import type { StoreAccess } from '@dakly/contracts/team';

import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { AppError } from '../platform/errors/app-error';
import { OutboxService } from '../platform/outbox/outbox.service';
import { TeamService } from '../team/team.service';
import { CHANNEL_CONNECTION_ERRORS } from './channel-connections.errors';
import { ChannelConnectionsRepository } from './channel-connections.repository';

function connectionError(code: keyof typeof CHANNEL_CONNECTION_ERRORS) {
  return new AppError(code, CHANNEL_CONNECTION_ERRORS[code]);
}

@Injectable()
export class ChannelConnectionsService {
  constructor(
    @Inject(ChannelConnectionsRepository) private readonly repository: ChannelConnectionsRepository,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(TeamService) private readonly team: TeamService,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async list(
    storeId: string,
    query: ChannelConnectionListQuery,
  ): Promise<{ items: ChannelConnection[]; nextCursor: string | null }> {
    const rows = await this.repository.list(storeId, query);
    const page = rows.slice(0, query.limit);
    return {
      nextCursor: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
      items: page.map((row) => ({
        ...row,
        tokenExpiresAt: row.tokenExpiresAt?.toISOString() ?? null,
        connectedAt: row.connectedAt.toISOString(),
        disconnectedAt: row.disconnectedAt?.toISOString() ?? null,
      })),
    };
  }

  async findInbound(
    storeId: string,
    lookup: Parameters<ChannelConnectionsRepository['findInbound']>[1],
  ) {
    const connection = await this.repository.findInbound(storeId, lookup);
    if (!connection) return null;
    const channel = connection.kind === 'facebook_page' ? 'messenger' : connection.kind;
    return { id: connection.id, channel, connectedAt: connection.connectedAt } as const;
  }

  async disconnect(
    storeId: string,
    channelConnectionId: string,
    access: StoreAccess,
  ): Promise<void> {
    if (!this.team.canManageChannelConnections(access))
      throw connectionError('CHANNEL_CONNECTION_ROLE_REQUIRED');
    const now = this.clock.now();
    await this.transaction.runLocked(storeId, async () => {
      const disconnected = await this.repository.disconnect(storeId, channelConnectionId, now);
      if (!disconnected) throw connectionError('CHANNEL_CONNECTION_NOT_FOUND');
      await this.outbox.publish({
        type: 'channel.disconnected',
        storeId,
        occurredAt: now.toISOString(),
        payload: { channelConnectionId },
      });
    });
  }
}
