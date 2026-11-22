import { useState } from 'react';

import { MAX_BULK_EDIT_PRODUCTS } from '@dakly/contracts/product-bulk-edits';
import type { ProductResponse } from '@dakly/contracts/products';

type Preset = 'hide' | 'category' | undefined;

// Selected products are kept whole, so the grid still has them after the person pages on.
export function useBulkSelection(canEdit: boolean) {
  const [selected, setSelected] = useState<ReadonlyMap<string, ProductResponse>>(new Map());
  const [editing, setEditing] = useState<{ preset: Preset } | null>(null);
  const select = (products: ProductResponse[], on: boolean) =>
    setSelected((current) => {
      const next = new Map(current);
      for (const product of products) {
        if (!on) next.delete(product.id);
        else if (next.size < MAX_BULK_EDIT_PRODUCTS) next.set(product.id, product);
      }
      return next;
    });
  const clear = () => {
    setSelected(new Map());
    setEditing(null);
  };
  return {
    selected,
    editing,
    startEditing: (preset: Preset) => setEditing({ preset }),
    clear,
    selection: canEdit
      ? {
          selectedIds: new Set(selected.keys()),
          onToggle: (product: ProductResponse) => select([product], !selected.has(product.id)),
          onTogglePage: select,
        }
      : undefined,
  };
}
