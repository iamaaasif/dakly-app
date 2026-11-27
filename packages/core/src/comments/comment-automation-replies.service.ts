import { Inject, Injectable } from '@nestjs/common';

import { AppError } from '../platform/errors/app-error';
import { ProductsService } from '../products/products.service';
import { CommentPostProductsService } from './comment-post-products.service';
import { commentLanguage, commentPriceReply } from './comment-price-reply';
import { automaticReplySkips, type ReplyBy } from './comment-rows';
import { CommentsService } from './comments.service';

type Outcome = 'sent' | 'skipped';
const by: ReplyBy = { actor: { kind: 'system' }, scope: 'automation' };

@Injectable()
export class CommentAutomationRepliesService {
  constructor(
    @Inject(CommentsService) private readonly comments: CommentsService,
    @Inject(CommentPostProductsService) private readonly postProducts: CommentPostProductsService,
    @Inject(ProductsService) private readonly products: ProductsService,
  ) {}

  replyPublicly(storeId: string, commentId: string, body: string) {
    return this.settle(() => this.comments.sendPublicReply(storeId, by, commentId, body));
  }

  async replyPrivately(
    storeId: string,
    commentId: string,
    { text, includeProduct }: { text: string; includeProduct: boolean },
  ) {
    const comment = await this.comments.triggerFacts(storeId, commentId);
    if (!comment) return 'skipped';
    const body = includeProduct ? await this.withProduct(storeId, comment, text) : text;
    return this.settle(() => this.comments.sendPrivateReply(storeId, by, commentId, body));
  }

  // The price comes from the catalogue and only when the post shows one product that can be sold
  // at one price; otherwise the owner's words go alone, never a guessed price.
  private async withProduct(
    storeId: string,
    comment: { channelConnectionId: string; externalPostId: string; text: string },
    text: string,
  ) {
    const { singleProductId } = await this.postProducts.forPost(storeId, comment);
    if (!singleProductId) return text;
    const [product] = await this.products.getManyForChat(storeId, [singleProductId]);
    const line = product && commentPriceReply(commentLanguage(comment.text), product)?.privateBody;
    return line ? `${text}\n${line}` : text;
  }

  // Another reply already won, or Meta's window closed: the step is settled, not failed.
  private async settle(send: () => Promise<void>): Promise<Outcome> {
    try {
      await send();
      return 'sent';
    } catch (error) {
      if (error instanceof AppError && automaticReplySkips.includes(error.code)) return 'skipped';
      throw error;
    }
  }
}
