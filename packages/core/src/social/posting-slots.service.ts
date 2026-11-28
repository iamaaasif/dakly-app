import { Inject, Injectable } from '@nestjs/common';

import type {
  PostingSlotsResponse,
  RecommendedPostingSlots,
  SavePostingSlotsInput,
} from '@dakly/contracts/social';

import { AuditService } from '../audit/audit.service';
import { ChannelConnectionsService } from '../channels/channel-connections.service';
import { OrderReportingService } from '../orders/order-reporting.service';
import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { DAY_MS } from '../platform/time';
import { StoresService } from '../stores/stores.service';
import { recommendPostingSlots } from './recommended-posting-times';
import { socialError } from './social.errors';

type PostingConnection = Awaited<
  ReturnType<ChannelConnectionsService['postingConnections']>
>[number];

@Injectable()
export class PostingSlotsService {
  constructor(
    @Inject(ChannelConnectionsService) private readonly channels: ChannelConnectionsService,
    @Inject(StoresService) private readonly stores: StoresService,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(OrderReportingService) private readonly orders: OrderReportingService,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async postingSlots(storeId: string, channelConnectionId: string): Promise<PostingSlotsResponse> {
    const [connection] = await this.channels.postingConnections(storeId, [channelConnectionId]);
    return this.response(storeId, connection);
  }

  // The hours with the most orders in the last 30 days, in the shop's own time zone.
  async recommendedSlots(storeId: string): Promise<RecommendedPostingSlots> {
    const since = new Date(this.clock.now().getTime() - 30 * DAY_MS);
    const hours = await this.orders.orderHourCounts(
      storeId,
      since,
      await this.stores.timeZone(storeId),
    );
    return recommendPostingSlots(hours);
  }

  replaceSlots(
    storeId: string,
    input: SavePostingSlotsInput,
    actor: { kind: 'user'; userId: string },
  ): Promise<PostingSlotsResponse> {
    return this.transaction.runLocked(storeId, async () => {
      const connection = await this.channels.savePostingSlots(storeId, input);
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
      slots: connection.postingSlots ?? recommendPostingSlots([]).slots,
    };
  }
}
