'use client';
import { useEffect } from 'react';
import type { UseFormReturn } from 'react-hook-form';

import type { ProductFormValues } from '@dakly/contracts/products';

// A new product is kept in this tab's session storage while it is typed, so a reload does not lose it.
const DRAFT_KEY = 'dakly:new-product-draft';

export function readProductDraft(): Partial<ProductFormValues> | null {
  try {
    const saved = window.sessionStorage.getItem(DRAFT_KEY);
    return saved ? (JSON.parse(saved) as Partial<ProductFormValues>) : null;
  } catch {
    return null;
  }
}

export function clearProductDraft() {
  try {
    window.sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // Storage can be blocked; the draft is a convenience only.
  }
}

export function useProductDraft(watch: UseFormReturn<ProductFormValues>['watch'], on: boolean) {
  useEffect(() => {
    if (!on) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const subscription = watch((values) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        try {
          window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(values));
        } catch {
          // Storage can be full or blocked; typing keeps working.
        }
      }, 400);
    });
    return () => {
      clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, [watch, on]);
}
