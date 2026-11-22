'use client';
import { useState } from 'react';
import { createPortal } from 'react-dom';

import type { ProductResponse } from '@dakly/contracts/products';
import { Button } from '@dakly/ui/button';
import { Dialog } from '@dakly/ui/dialog';

import { StockAdjustmentForm } from './stock-adjustment-form';

type ChangeStockDialogProps = { product: ProductResponse; onClose: () => void };

// A product with one variant goes straight to the form; with several, the seller picks the variant first.
export function ChangeStockDialog(props: ChangeStockDialogProps) {
  // The page opens this from inside the product form; a portal keeps its form out of that form.
  return createPortal(<ChangeStockContent {...props} />, document.body);
}

function ChangeStockContent({ product, onClose }: ChangeStockDialogProps) {
  const [variantId, setVariantId] = useState(
    product.variants.length === 1 ? product.variants[0]!.id : undefined,
  );
  const variant = product.variants.find((item) => item.id === variantId);
  if (variant)
    return <StockAdjustmentForm productName={product.name} variant={variant} onClose={onClose} />;
  return (
    <Dialog title={`Change stock: ${product.name}`} open onClose={onClose} className="max-w-md">
      <ul className="space-y-2">
        {product.variants.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-3">
            <span className="text-sm text-text">
              {item.title}{' '}
              <span className="text-text-muted tabular-nums">· {item.onHand} on hand</span>
            </span>
            <Button
              variant="secondary"
              aria-label={`Change stock for ${item.title}`}
              onClick={() => setVariantId(item.id)}
            >
              Change stock
            </Button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
