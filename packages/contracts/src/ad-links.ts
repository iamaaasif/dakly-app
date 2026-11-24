import { z } from 'zod';

export const adLinkSources = ['ad', 'post'] as const;

// An ad id is digits. A post id is the Page id and the post id joined by an underscore.
export const adLinkExternalIdSchema = z.string().regex(/^\d{5,64}(?:_\d{1,64})?$/);
export const adLinkSourceSchema = z.enum(adLinkSources);

// An ad shows at most four products, so a link holds at most four.
export const setAdLinkSchema = z.strictObject({
  productIds: z.array(z.uuid()).min(1).max(4),
});

export const adReadStates = ['pending', 'read', 'unreadable'] as const;
export const adSuggestionOrigins = ['catalog', 'photo'] as const;

export type SetAdLinkInput = z.infer<typeof setAdLinkSchema>;
export type AdLinkSource = (typeof adLinkSources)[number];

export type AdLink = {
  source: AdLinkSource;
  externalId: string;
  products: { productId: string; name: string }[];
};

export type AdReadState = (typeof adReadStates)[number];
export type AdSuggestionOrigin = (typeof adSuggestionOrigins)[number];

export const adStatuses = ['confirmed', 'suggested', 'unlinked'] as const;
export type AdStatus = (typeof adStatuses)[number];

type AdProduct = { productId: string; name: string };

// One ad or post a customer came from. Only `products` is used in replies; `suggestions` wait for the owner.
export type AdListItem = {
  source: AdLinkSource;
  externalId: string;
  title: string | null;
  photoUrl: string | null;
  status: AdStatus;
  products: AdProduct[];
  suggestions: AdProduct[];
  lastSeenAt: string;
};

export type AdList = { items: AdListItem[] };
