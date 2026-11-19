import { Injectable } from '@nestjs/common';

import type { PostingSlotsResponse, SavePostingSlotsInput } from '@dakly/contracts/social';

import { AuditService } from '../audit/audit.service';
import { ChannelConnectionsService } from '../channels/channel-connections.service';
import { StoreTransaction } from '../platform/database/store-transaction';
import { StoresService } from '../stores/stores.service';
import { recommendedPostingSlots } from './next-posting-slot';
import { socialError } from './social.errors';

type PostingConnection = Awaited<
  ReturnType<ChannelConnectionsService['postingConnections']>
>[number];

@Injectable()
export class PostingSlotsService {
  constructor(
    private readonly channels: ChannelConnectionsService,
    private readonly stores: StoresService,
    private readonly transaction: StoreTransaction,
    private readonly audit: AuditService,
  ) {}

  async postingSlots(storeId: string, channelConnectionId: string): Promise<PostingSlotsResponse> {
    const [connection] = await this.channels.postingConnections(storeId, {
      ids: [channelConnectionId],
    });
    return this.response(storeId, connection);
  }

  replaceSlots(
    storeId: string,
    input: SavePostingSlotsInput,
    actor: { kind: 'user'; userId: string },
  ): Promise<PostingSlotsResponse> {
    return this.transaction.runLocked(storeId, async () => {
      const [connection] = await this.channels.postingConnections(storeId, input);
      const saved = await this.response(storeId, connection);
      await this.audit.record(storeId, {
        actor,
        action: 'post.slots_saved',
        entityType: 'channel_connection',
        entityId: saved.channelConnectionId,
      });
      return saved;
    });
  }

  private async response(
    storeId: string,
    connection: PostingConnection | undefined,
  ): Promise<PostingSlotsResponse> {
    if (!connection || connection.status === 'disconnected')
      throw socialError('POST_CONNECTION_NOT_FOUND');
    return {
      channelConnectionId: connection.id,
      timeZone: await this.stores.timeZone(storeId),
      slots: connection.postingSlots ?? recommendedPostingSlots,
    };
  }
}
