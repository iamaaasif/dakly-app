import { Inject, Injectable } from '@nestjs/common';

import { BillingService } from '../billing/billing.service';
import { ChannelConnectionsService } from '../channels/channel-connections.service';
import { CommentPostProductsService } from '../comments/comment-post-products.service';
import {
  commentPriceReply,
  type CommentLanguage,
  priceQuestion,
  replyLanguageFor,
  publicPriceAcknowledgement,
} from '../comments/comment-price-reply';
import { CommentsService } from '../comments/comments.service';
import { KillSwitchesService } from '../kill-switches/kill-switches.service';
import { ProductsService } from '../products/products.service';
import { StoresService } from '../stores/stores.service';
import { AiAgentSettingsRepository } from './ai-agent-settings.repository';

@Injectable()
export class CommentAutoReplyService {
  constructor(
    @Inject(AiAgentSettingsRepository) private readonly settings: AiAgentSettingsRepository,
    @Inject(CommentsService) private readonly comments: CommentsService,
    @Inject(ChannelConnectionsService) private readonly channels: ChannelConnectionsService,
    @Inject(ProductsService) private readonly products: ProductsService,
    @Inject(CommentPostProductsService) private readonly postProducts: CommentPostProductsService,
    @Inject(StoresService) private readonly stores: StoresService,
    @Inject(BillingService) private readonly billing: BillingService,
    @Inject(KillSwitchesService) private readonly switches: KillSwitchesService,
  ) {}

  async reply(storeId: string, commentId: string) {
    const comment = await this.comments.pendingFacebookReply(storeId, commentId);
    // An automation that matched this comment answers it; the AI stays out.
    if (!comment?.body || comment.claimedByAutomation) return;
    const language = priceQuestion(comment.body);
    if (!language) return;
    const stillAllowed = () => this.mayAnswer(storeId, comment.channelConnectionId);
    if (!(await stillAllowed())) return;
    const settings = await this.settings.enabled(storeId);
    const spoken = replyLanguageFor(language, settings?.rules.replyLanguage ?? 'match_customer');
    const reply = comment.privateSent
      ? { publicBody: publicPriceAcknowledgement[spoken] }
      : await this.priceReply(storeId, comment, spoken);
    if (reply)
      await this.comments.replyAutomatically(storeId, commentId, { ...reply, stillAllowed });
  }

  private async priceReply(
    storeId: string,
    comment: { channelConnectionId: string; externalPostId: string },
    spoken: CommentLanguage,
  ) {
    const product = await this.productForPost(storeId, comment);
    return product && commentPriceReply(spoken, product);
  }

  private async mayAnswer(storeId: string, connectionId: string) {
    const settings = await this.settings.enabled(storeId);
    return !!settings?.answerComments && (await this.canReply(storeId, connectionId));
  }

  private async canReply(storeId: string, connectionId: string) {
    if (!(await this.channels.isAiLive(storeId, connectionId))) return false;
    if (!(await this.stores.isActive(storeId))) return false;
    if (!(await this.stores.settings(storeId)).extensions.includes('chats')) return false;
    if (await this.billing.isReadOnly(storeId)) return false;
    return !(await this.switches.isPaused('ai_replies', storeId));
  }

  private async productForPost(
    storeId: string,
    target: { channelConnectionId: string; externalPostId: string },
  ) {
    const { singleProductId } = await this.postProducts.forPost(storeId, target);
    if (!singleProductId) return;
    const [product] = await this.products.getManyForChat(storeId, [singleProductId]);
    return product;
  }
}
