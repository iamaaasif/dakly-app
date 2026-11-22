import type { AssistantProductDraft } from '@dakly/contracts/assistant';
import type { ProductFormValues } from '@dakly/contracts/products';

import { applyOptions, type GridVariant } from './product-variant-grid';
import { takaInputFromPoisha } from '@/lib/format-money';

const blankVariant: GridVariant = {
  optionValues: {},
  sku: null,
  priceOverridePoisha: '',
  costPoisha: '',
  lowStockThreshold: '',
  initialStock: 0,
};

// The new product starts hidden, like any other, so the owner decides when it goes live.
export function assistantDraftValues(draft: AssistantProductDraft): ProductFormValues {
  const variants = applyOptions([], draft.options, [blankVariant]).map((variant) => ({
    ...variant,
    initialStock: draft.stockEach ?? 0,
  }));
  return {
    name: draft.name,
    description: draft.description ?? '',
    category: draft.category ?? '',
    options: draft.options,
    pricePoisha: draft.pricePoisha === undefined ? '' : takaInputFromPoisha(draft.pricePoisha),
    variants,
    isStockTracked: true,
    status: 'hidden',
  };
}

// Named in the notice on the page, so the owner knows what to check.
export function assistantFilledFields(draft: AssistantProductDraft): string[] {
  return [
    'Name',
    ...(draft.description ? ['Description'] : []),
    ...(draft.category ? ['Category'] : []),
    ...(draft.pricePoisha === undefined ? [] : ['Price']),
    ...draft.options.map(({ name }) => name),
    ...(draft.stockEach === undefined ? [] : ['Stock']),
  ];
}
