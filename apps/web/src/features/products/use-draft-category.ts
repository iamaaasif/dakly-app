import { useEffect } from 'react';
import type { UseFormReturn } from 'react-hook-form';

import type { AssistantProductDraft } from '@dakly/contracts/assistant';
import type { ProductFormInput, ProductFormValues } from '@dakly/contracts/products';

import { useProductCategories } from './api/get-categories';
import { categoryIdForName } from './product-assistant-draft';

// Picks the draft's category once the shop's list has loaded, if the shop has that category.
export function useDraftCategory(
  form: UseFormReturn<ProductFormValues, undefined, ProductFormInput>,
  draft: AssistantProductDraft | undefined,
) {
  const categories = useProductCategories().data?.items;
  useEffect(() => {
    const id =
      draft?.category && categories && !form.getValues('categoryId')
        ? categoryIdForName(categories, draft.category)
        : undefined;
    if (id) form.setValue('categoryId', id);
  }, [draft?.category, categories, form]);
}
