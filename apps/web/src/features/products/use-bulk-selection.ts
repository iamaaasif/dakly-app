import { useState } from 'react';

import { MAX_BULK_EDIT_PRODUCTS } from '@dakly/contracts/product-bulk-edits';
import type { ProductResponse } from '@dakly/contracts/products';

type Preset = 'hide' | 'category' | undefined;

type SelectionState = {
  selected: ReadonlyMap<string, ProductResponse>;
  editing: { preset: Preset } | null;
};

// Selected products are kept whole, so the grid still has them after the person pages on.
export function useBulkSelection(canEdit: boolean) {
  const [state, setState] = useState<SelectionState>({ selected: new Map(), editing: null });
  const { selected, editing } = state;
  const select = (products: ProductResponse[], on: boolean) =>
    setState((current) => {
      const next = new Map(current.selected);
      for (const product of products) {
        if (!on) next.delete(product.id);
        else if (next.size < MAX_BULK_EDIT_PRODUCTS) next.set(product.id, product);
      }
      return { ...current, selected: next };
    });
  const onProductChanged = (productId: string, saved: ProductResponse | null) =>
    setState((current) => {
      if (!current.selected.has(productId)) return current;
      const next = new Map(current.selected);
      if (saved) next.set(productId, saved);
      else next.delete(productId);
      return { selected: next, editing: null };
    });
  return {
    selected,
    editing,
    startEditing: (preset: Preset) => setState((current) => ({ ...current, editing: { preset } })),
    clear: () => setState({ selected: new Map(), editing: null }),
    selection: canEdit
      ? {
          selectedIds: new Set(selected.keys()),
          onToggle: (product: ProductResponse) => select([product], !selected.has(product.id)),
          onTogglePage: select,
          onProductChanged,
        }
      : undefined,
  };
}
