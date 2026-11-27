'use client';
import { useEffect } from 'react';
import type { UseFormReturn } from 'react-hook-form';

import type { ProductFormValues } from '@dakly/contracts/products';

// A new product is kept in this tab's session storage while it is typed, so a reload does not lose it.
// The key holds the shop, so switching shop in the same tab never brings back another shop's draft.
const draftKey = (storeId: string) => `dakly:new-product-draft:${storeId}`;

// One write can wait for the typing to pause. Clearing the draft cancels it, so a write that was
// waiting when Create succeeded cannot bring the draft back.
let pendingWrite: ReturnType<typeof setTimeout> | undefined;

export function readProductDraft(storeId: string): Partial<ProductFormValues> | null {
  try {
    const saved = window.sessionStorage.getItem(draftKey(storeId));
    return saved ? (JSON.parse(saved) as Partial<ProductFormValues>) : null;
  } catch {
    return null;
  }
}

export function clearProductDraft(storeId: string) {
  clearTimeout(pendingWrite);
  try {
    window.sessionStorage.removeItem(draftKey(storeId));
  } catch {
    // Storage can be blocked; the draft is a convenience only.
  }
}

export function useProductDraft(
  watch: UseFormReturn<ProductFormValues>['watch'],
  storeId: string | undefined,
) {
  useEffect(() => {
    if (!storeId) return;
    const subscription = watch((values) => {
      clearTimeout(pendingWrite);
      pendingWrite = setTimeout(() => {
        try {
          window.sessionStorage.setItem(draftKey(storeId), JSON.stringify(values));
        } catch {
          // Storage can be full or blocked; typing keeps working.
        }
      }, 400);
    });
    return () => subscription.unsubscribe();
  }, [watch, storeId]);
}
