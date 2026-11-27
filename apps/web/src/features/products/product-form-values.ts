import type { AssistantProductDraft } from '@dakly/contracts/assistant';
import {
  createProductSchema,
  type ProductFormValues,
  type ProductResponse,
} from '@dakly/contracts/products';

import { assistantDraftValues } from './product-assistant-draft';
import type { QuickAddHandoff } from './quick-add-handoff';
import { takaInputFromPoisha } from '@/lib/format-money';

type FormValuesSource = {
  product?: ProductResponse;
  // Values typed in the quick add, used only for a new product.
  initial?: QuickAddHandoff;
  assistantDraft?: AssistantProductDraft;
  duplicateSource?: ProductResponse;
  page?: unknown;
};

export function formValues({
  product,
  initial,
  assistantDraft,
  duplicateSource,
  page,
}: FormValuesSource): ProductFormValues {
  if (product) return sourceFormValues(product, Boolean(page), false);
  if (duplicateSource) return sourceFormValues(duplicateSource, Boolean(page), true);
  if (assistantDraft) return assistantDraftValues(assistantDraft);
  return {
    name: initial?.name ?? '',
    options: [],
    pricePoisha: initial?.price ?? '',
    variants: [
      {
        optionValues: {},
        sku: null,
        priceOverridePoisha: '',
        costPoisha: '',
        lowStockThreshold: '',
        initialStock: Number(initial?.stock || 0),
      },
    ],
    isStockTracked: true,
    status: 'hidden',
  };
}

function sourceFormValues(
  source: ProductResponse,
  onPage: boolean,
  isDuplicate: boolean,
): ProductFormValues {
  return {
    name: isDuplicate ? copyName(source.name) : source.name,
    description: source.description,
    categoryId: source.categoryId,
    brandId: source.brandId,
    weightGrams: weightText(source.weightGrams),
    aliases: source.aliases,
    options: source.options,
    ...priceFields(source, onPage),
    ...(isDuplicate ? {} : negotiationFields(source)),
    variants: source.variants.map(
      ({ id, optionValues, sku, priceOverridePoisha, costPoisha, lowStockThreshold, onHand }) => ({
        id: isDuplicate ? undefined : id,
        optionValues: Object.fromEntries(
          source.options.map(({ name }, index) => [index, optionValues[name]!]),
        ),
        // Each product code is unique within the shop.
        sku: isDuplicate ? null : sku,
        priceOverridePoisha: takaInputFromPoisha(priceOverridePoisha),
        costPoisha: takaInputFromPoisha(costPoisha),
        lowStockThreshold: lowStockThreshold === null ? '' : String(lowStockThreshold),
        initialStock: isDuplicate ? 0 : onHand,
      }),
    ),
    isStockTracked: source.isStockTracked,
    isVisibleInChats: source.isVisibleInChats,
    isVisibleInOrderLink: source.isVisibleInOrderLink,
    status: isDuplicate ? 'hidden' : undefined,
  };
}

function copyName(name: string) {
  const suffix = ' copy';
  const limit = createProductSchema.shape.name.maxLength;
  const stem = limit === null ? name : name.slice(0, limit - suffix.length).trimEnd();
  return `${stem}${suffix}`;
}

function priceFields(product: ProductResponse, onPage: boolean) {
  const price = product.pricePoisha;
  const oldPrice = product.compareAtPricePoisha;
  if (onPage && oldPrice !== null && oldPrice > price)
    return {
      pricePoisha: takaInputFromPoisha(oldPrice),
      compareAtPricePoisha: takaInputFromPoisha(price),
    };
  return {
    pricePoisha: takaInputFromPoisha(price),
    compareAtPricePoisha: takaInputFromPoisha(onPage ? null : oldPrice),
  };
}

function negotiationFields(product: ProductResponse) {
  return {
    negotiationEnabled: product.negotiationEnabled,
    negotiationOpeningPoisha: takaInputFromPoisha(product.negotiationOpeningPoisha ?? null),
    negotiationFloorPoisha: takaInputFromPoisha(product.negotiationFloorPoisha ?? null),
  };
}

function weightText(grams: number | null) {
  return grams === null ? '' : String(grams);
}
