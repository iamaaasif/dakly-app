import { Inject, Injectable } from '@nestjs/common';

import { BillingService } from '../billing/billing.service';
import { ChannelConnectionsService } from '../channels/channel-connections.service';
import { CommentsService } from '../comments/comments.service';
import { KillSwitchesService } from '../kill-switches/kill-switches.service';
import { ProductSearchService } from '../product-search/product-search.service';
import { ProductSearchSourceService } from '../products/product-search-source.service';
import { ProductsService } from '../products/products.service';
import { SocialService } from '../social/social.service';
import { StoresService } from '../stores/stores.service';
import { AiAgentSettingsRepository } from './ai-agent-settings.repository';
import {
  commentPriceReply,
  priceQuestion,
  publicPriceAcknowledgement,
} from './comment-price-reply';

@Injectable()
export class CommentAutoReplyService {
  constructor(
    @Inject(AiAgentSettingsRepository) private readonly settings: AiAgentSettingsRepository,
    @Inject(CommentsService) private readonly comments: CommentsService,
    @Inject(ChannelConnectionsService) private readonly channels: ChannelConnectionsService,
    @Inject(ProductSearchSourceService) private readonly source: ProductSearchSourceService,
    @Inject(ProductsService) private readonly products: ProductsService,
    @Inject(ProductSearchService) private readonly search: ProductSearchService,
    @Inject(SocialService) private readonly social: SocialService,
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
    const settings = await this.settings.enabled(storeId);
    const stillAllowed = () => this.mayAnswer(storeId, comment.channelConnectionId);
    if (!settings?.answerComments || !(await stillAllowed())) return;
    const replyLanguage = { match_customer: language, bn: 'bangla', en: 'english' } as const;
    const spoken = replyLanguage[settings.rules.replyLanguage];
    if (comment.privateSent)
      return this.comments.replyAutomatically(storeId, commentId, {
        publicBody: publicPriceAcknowledgement[spoken],
        stillAllowed,
      });
    const product = await this.productForPost(storeId, comment);
    if (!product) return;
    const reply = commentPriceReply(spoken, product);
    if (reply) await this.comments.replyAutomatically(storeId, commentId, { ...reply, stillAllowed });
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
    const post = await this.social.publishedPostContent(storeId, target);
    if (!post) return;
    // Products hidden after publication still count when deciding what the post shows.
    const photos = await this.source.postProductsByPhotos(storeId, post.mediaFileIds);
    if (photos.length > 1 || photos.some(({ variantPhoto }) => variantPhoto)) return;
    const named = post.caption
      ? await this.search.productsNamedInCaption(storeId, post.caption)
      : [];
    if (!named) return;
    const candidates = [...new Set([...photos.map(({ id }) => id), ...named])];
    const [productId] = candidates;
    if (candidates.length !== 1 || !productId) return;
    const [product] = await this.products.getManyForChat(storeId, [productId]);
    return product;
  }
}
