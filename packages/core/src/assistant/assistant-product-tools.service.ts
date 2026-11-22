import { Inject, Injectable } from '@nestjs/common';

import type { AssistantProductChange, AssistantProductDraft } from '@dakly/contracts/assistant';
import { changeProductsTool, draftProductTool } from '@dakly/contracts/assistant-tools';
import type { ProductBulkEditRow } from '@dakly/contracts/product-bulk-edits';
import type { ProductResponse } from '@dakly/contracts/products';

import { ProductsService } from '../products/products.service';

export const MAX_MATCHED_PRODUCTS = 50;

type PriceChange = NonNullable<(typeof changeProductsTool.input)['_output']['priceChange']>;
type Skipped = { name: string; reason: 'SIZE_PRICES' | 'STOCK_NOT_COUNTED' | 'NO_CHANGE' };
export type ProductProposal =
  | { kind: 'draft'; draft: AssistantProductDraft }
  | { kind: 'change'; change: AssistantProductChange };
// What the model reads back, and the proposal the owner reviews. Only the owner's page saves anything.
type ProductToolOutcome = { result: object; proposal?: ProductProposal };

// Turns a draft or a change into something the owner reviews. It reads products and never writes one.
@Injectable()
export class AssistantProductToolsService {
  constructor(@Inject(ProductsService) private readonly products: ProductsService) {}

  draft(raw: unknown): ProductToolOutcome {
    const input = draftProductTool.input.parse(raw);
    const { priceTaka, category, description, stockEach, ...rest } = input;
    // The draft leaves out what the owner did not say, so the page shows only what was filled.
    const draft: AssistantProductDraft = {
      ...rest,
      ...(priceTaka === null ? {} : { pricePoisha: Math.round(priceTaka * 100) }),
      ...(category === null ? {} : { category }),
      ...(description === null ? {} : { description }),
      ...(stockEach === null ? {} : { stockEach }),
    };
    return { result: { opened: 'add_product_page', ...input }, proposal: { kind: 'draft', draft } };
  }

  // The service finds the products by name; the model never names an id.
  async change(storeId: string, raw: unknown): Promise<ProductToolOutcome> {
    const { productName, priceChange, stock } = changeProductsTool.input.parse(raw);
    const { items } = await this.products.list(storeId, {
      search: productName,
      limit: MAX_MATCHED_PRODUCTS + 1,
    });
    if (!items.length) return { result: { error: 'NO_PRODUCT_MATCHES' } };
    if (items.length > MAX_MATCHED_PRODUCTS)
      return { result: { error: 'TOO_MANY_PRODUCTS', max: MAX_MATCHED_PRODUCTS } };

    const rows: ProductBulkEditRow[] = [];
    const matched: ProductResponse[] = [];
    const skipped: Skipped[] = [];
    for (const product of items) {
      const outcome = proposedRow(product, priceChange ?? undefined, stock ?? undefined);
      if ('skipped' in outcome) skipped.push({ name: product.name, reason: outcome.skipped });
      else {
        rows.push(outcome.row);
        matched.push(product);
      }
    }
    if (!rows.length) return { result: { error: 'NOTHING_TO_CHANGE', skipped } };
    return {
      result: {
        opened: 'bulk_edit_review',
        productCount: matched.length,
        changes: matched.map(describe(rows)),
        skipped,
      },
      proposal: { kind: 'change', change: { products: matched, rows } },
    };
  }
}

type RowOutcome = { row: ProductBulkEditRow } | { skipped: Skipped['reason'] };

// A size with its own price hides the product price, so a price change leaves that product alone.
const hasSizePrices = (product: ProductResponse) =>
  product.variants.some((variant) => variant.priceOverridePoisha !== null);

// Stock lives on one size, so a product with sizes, or one that does not count stock, has none to set.
const countedVariant = (product: ProductResponse) =>
  product.isStockTracked && product.variants.length === 1 ? product.variants[0] : undefined;

function proposedRow(
  product: ProductResponse,
  priceChange: PriceChange | undefined,
  stock: number | undefined,
): RowOutcome {
  const changes = proposedValues(product, priceChange, stock);
  if (Object.keys(changes).length) return { row: { productId: product.id, ...changes } };
  return {
    skipped: skipReason(
      Boolean(priceChange) && hasSizePrices(product),
      stock !== undefined && !countedVariant(product),
    ),
  };
}

function proposedValues(
  product: ProductResponse,
  priceChange: PriceChange | undefined,
  stock: number | undefined,
) {
  const counted = countedVariant(product);
  const pricePoisha =
    priceChange && !hasSizePrices(product) ? newPrice(product.pricePoisha, priceChange) : undefined;
  const newStock = counted && stock !== undefined && stock !== counted.onHand ? stock : undefined;
  return {
    ...(pricePoisha === undefined ? {} : { pricePoisha }),
    ...(newStock === undefined ? {} : { stock: newStock }),
  };
}

function skipReason(sizePrices: boolean, stockNotCounted: boolean): Skipped['reason'] {
  if (sizePrices) return 'SIZE_PRICES';
  return stockNotCounted ? 'STOCK_NOT_COUNTED' : 'NO_CHANGE';
}

// Whole poisha; a price that would not stay above zero or would not change is left alone.
function newPrice(current: number, { how, amount }: PriceChange): number | undefined {
  const next = {
    set: Math.round(amount * 100),
    raise_by: current + Math.round(amount * 100),
    lower_by: current - Math.round(amount * 100),
    raise_percent: Math.round(current * (1 + amount / 100)),
    lower_percent: Math.round(current * (1 - amount / 100)),
  }[how];
  return next > 0 && next !== current && Number.isSafeInteger(next) ? next : undefined;
}

const taka = (poisha: number) => poisha / 100;

function describe(rows: ProductBulkEditRow[]) {
  const byId = new Map(rows.map((row) => [row.productId, row]));
  return (product: ProductResponse) => {
    const row = byId.get(product.id)!;
    return {
      name: product.name,
      ...(row.pricePoisha === undefined
        ? {}
        : { oldPriceTaka: taka(product.pricePoisha), newPriceTaka: taka(row.pricePoisha) }),
      ...(row.stock === undefined
        ? {}
        : { oldStock: product.variants[0]!.onHand, newStock: row.stock }),
    };
  };
}
