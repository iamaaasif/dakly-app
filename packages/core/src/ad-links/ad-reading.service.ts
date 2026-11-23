import { Inject, Injectable } from '@nestjs/common';

import type { AdLinkSource, AdReadState } from '@dakly/contracts/ad-links';
import type { chatChannels } from '@dakly/contracts/channels';
import { photoReadingSchema, type PhotoReading } from '@dakly/contracts/chats';
import type { LlmImage } from '@dakly/providers/llm/llm-driver';

import { AiService } from '../ai/ai.service';
import { ChannelConnectionsService } from '../channels/channel-connections.service';
import { InboxService } from '../messaging/inbox.service';
import { AppError } from '../platform/errors/app-error';
import { ProductSearchService } from '../product-search/product-search.service';
import { UsageService } from '../usage/usage.service';
import { adLinkError } from './ad-links.errors';
import { AdLinksService } from './ad-links.service';
import { AdSourcesRepository } from './ad-sources.repository';
import { readAdPhoto } from './prompts/read-ad-photo.v1';

const maxPhotoBytes = 5 * 1024 * 1024;
const suggestionLimit = 4;

// The model is down for a moment, not for this picture, so the queue should try again.
const transientFailures = new Set([
  'AI_PAUSED',
  'AI_STORE_BUSY',
  'LLM_TIMEOUT',
  'LLM_RATE_LIMITED',
  'LLM_UNAVAILABLE',
  'LLM_REQUEST_FAILED',
  'LLM_INVALID_RESPONSE',
]);

@Injectable()
export class AdReadingService {
  constructor(
    @Inject(InboxService) private readonly inbox: InboxService,
    @Inject(AdLinksService) private readonly links: AdLinksService,
    @Inject(AdSourcesRepository) private readonly sources: AdSourcesRepository,
    @Inject(ChannelConnectionsService) private readonly connections: ChannelConnectionsService,
    @Inject(ProductSearchService) private readonly search: ProductSearchService,
    @Inject(AiService) private readonly ai: AiService,
    @Inject(UsageService) private readonly usage: UsageService,
  ) {}

  // Runs for every inbound message and does the work once per ad. It only ever writes
  // suggestions: the owner's confirmed link is the one thing the reply reads. Runs outside any
  // transaction because it calls Meta and the model.
  async readFromChat(storeId: string, conversationId: string): Promise<void> {
    const referral = await this.inbox.referralOf(storeId, conversationId);
    const key = referral && adKey(referral);
    if (!referral || !key) return;
    const seen = await this.sources.noteSeen(storeId, key, {
      title: referral.title,
      photoUrl: referral.photoUrl,
    });
    if (seen.readState !== 'pending') return;
    // The owner already chose; suggesting again would only add noise.
    if ((await this.links.productIdsFor(storeId, referral)).length)
      return this.save(storeId, key, 'read', []);
    const picture = await this.downloadPicture(storeId, referral, seen.photoUrl);
    const reading = picture && (await this.describe(storeId, key.externalId, seen.title, picture));
    const text = [seen.title, reading && searchText(reading)].filter(Boolean).join('\n');
    if (!text) return this.save(storeId, key, 'unreadable', []);
    const products = suggestedProducts(await this.search.matchPhoto(storeId, text));
    return this.save(
      storeId,
      key,
      'read',
      products.slice(0, suggestionLimit).map(({ id }) => id),
    );
  }

  private save(storeId: string, key: AdKey, readState: AdReadState, productIds: string[]) {
    return this.sources.finishReading(storeId, key, { readState, origin: 'photo', productIds });
  }

  private async downloadPicture(
    storeId: string,
    referral: { channelConnectionId: string; channel: (typeof chatChannels)[number] },
    photoUrl: string | null,
  ): Promise<LlmImage | undefined> {
    if (!photoUrl || referral.channel === 'whatsapp') return undefined;
    try {
      const prepared = await this.connections.prepareMetaSend(
        storeId,
        referral.channelConnectionId,
        referral.channel === 'instagram' ? 'instagram' : 'messenger',
      );
      const file = await this.connections.downloadMetaMedia(prepared, photoUrl, maxPhotoBytes);
      return file.kind === 'downloaded'
        ? { contentType: file.contentType, bytes: file.bytes }
        : undefined;
    } catch (error) {
      // A page that is no longer connected cannot give the picture, but the title may still match.
      if (error instanceof AppError && error.code === 'CHANNEL_NOT_CONNECTED') return undefined;
      throw error;
    }
  }

  private async describe(
    storeId: string,
    adId: string,
    title: string | null,
    image: LlmImage,
  ): Promise<PhotoReading | undefined> {
    const usageReference = `ad:${adId}`;
    if (
      !(await this.usage.isConsumed(storeId, 'ai_conversation', usageReference)) &&
      !(await this.usage.hasAllowance(storeId, 'ai_conversation', 1))
    )
      return undefined;
    const result = await this.ai.run(storeId, {
      tier: 'vision',
      purpose: 'describe_image',
      usageReference,
      prompt: readAdPhoto,
      input: JSON.stringify({ ad_title: title ?? '' }),
      images: [image],
      output: photoReadingSchema,
    });
    if (result.kind === 'output') return result.output;
    if (result.kind === 'failure' && transientFailures.has(result.code))
      throw adLinkError('AD_READING_UNAVAILABLE');
    return undefined;
  }
}

type AdKey = { source: AdLinkSource; externalId: string };

// The ad's own id wins; a post the ad promotes is the key only when the referral has no ad id.
function adKey({
  adId,
  postId,
}: {
  adId: string | null;
  postId: string | null;
}): AdKey | undefined {
  if (adId) return { source: 'ad', externalId: adId };
  return postId ? { source: 'post', externalId: postId } : undefined;
}

type PhotoMatch = Awaited<ReturnType<ProductSearchService['matchPhoto']>>;

function suggestedProducts(match: PhotoMatch) {
  if (match.kind === 'sure' || match.kind === 'sold_out') return [match.product];
  return match.kind === 'unsure' ? match.products : [];
}

function searchText({ subject, description, searchWords, visibleText }: PhotoReading): string {
  return subject === 'product' ? [description, ...searchWords, visibleText].join(' ') : '';
}
