import { Inject, Injectable } from '@nestjs/common';

import { ProductSearchService } from '../product-search/product-search.service';
import { ProductSearchSourceService } from '../products/product-search-source.service';
import { PublishedPostsService } from '../social/published-posts.service';

type PostTarget = { channelConnectionId: string; externalPostId: string };

@Injectable()
export class CommentPostProductsService {
  constructor(
    @Inject(PublishedPostsService) private readonly posts: PublishedPostsService,
    @Inject(ProductSearchSourceService) private readonly source: ProductSearchSourceService,
    @Inject(ProductSearchService) private readonly search: ProductSearchService,
  ) {}

  // Products hidden after publication still count. singleProductId is set only when the post
  // shows exactly one product for certain, because a price must never be guessed.
  async forPost(storeId: string, target: PostTarget) {
    const post = await this.posts.content(storeId, target);
    if (!post) return { productIds: [] as string[] };
    const photos = await this.source.postProductsByPhotos(storeId, post.mediaFileIds);
    const named = post.caption
      ? await this.search.productsNamedInCaption(storeId, post.caption)
      : [];
    const productIds = [...new Set([...photos.map(({ id }) => id), ...(named ?? [])])];
    const isCertain =
      named !== undefined && photos.length <= 1 && !photos.some(({ variantPhoto }) => variantPhoto);
    return {
      productIds,
      singleProductId: isCertain && productIds.length === 1 ? productIds[0] : undefined,
    };
  }
}
