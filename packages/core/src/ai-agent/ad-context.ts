import { adProductsV1 } from './prompts/ad-products.v1';

export const AD_PRODUCTS_TOOL = 'ad_products';
export const AD_PRODUCT_LIMIT = 4;
// The referral stays the chat's context only while Meta's own 24-hour window from the ad is open;
// later the customer may be asking about anything the shop sells.
export const AD_CONTEXT_MS = 24 * 60 * 60 * 1000;
// The run records this beside the reply prompt's version when the block is sent.
export const adProductsVersion = adProductsV1.version;

export function isAdContextFresh(referredAt: Date | null, now: Date): boolean {
  return referredAt !== null && now.getTime() - referredAt.getTime() < AD_CONTEXT_MS;
}

// The ad's products as the reply model reads them, each read again for this turn.
export function adProducts(products: object[]) {
  return { rule: adProductsV1.rule, products: products.slice(0, AD_PRODUCT_LIMIT) };
}
