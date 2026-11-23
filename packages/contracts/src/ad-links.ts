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
