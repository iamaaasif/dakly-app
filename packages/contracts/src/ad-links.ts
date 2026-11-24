import { z } from 'zod';

export const adLinkSources = ['ad', 'post'] as const;

// Meta ids are long digit strings; anything else cannot be one of the shop's ads or posts.
export const adLinkExternalIdSchema = z.string().regex(/^\d{5,64}$/);
export const adLinkSourceSchema = z.enum(adLinkSources);

// An ad shows at most four products, so a link holds at most four.
export const setAdLinkSchema = z.strictObject({
  productIds: z.array(z.uuid()).min(1).max(4),
});

export type SetAdLinkInput = z.infer<typeof setAdLinkSchema>;
export type AdLinkSource = (typeof adLinkSources)[number];

export type AdLink = {
  source: AdLinkSource;
  externalId: string;
  products: { productId: string; name: string }[];
};
