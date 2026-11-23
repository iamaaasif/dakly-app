import { useQuery } from '@tanstack/react-query';

import type {
  ProductBrandListResponse,
  ProductCategoryListResponse,
  ProductCategoryResponse,
} from '@dakly/contracts/product-lists';
import { CATEGORY_PATH_SEPARATOR } from '@dakly/contracts/product-lists';

import { productsKeys } from '@/lib/product-query-keys';
import { useSessionContext } from '@/lib/session-context';
import { useStoreRequest } from '@/lib/store-request';

export function useProductCategories() {
  const { request, contextTag } = useStoreRequest();
  const { data } = useSessionContext();
  return useQuery({
    queryKey: productsKeys.categories(contextTag),
    queryFn: ({ signal }) =>
      request<ProductCategoryListResponse>('/products/categories', { signal }),
    enabled: Boolean(contextTag && data?.currentStore?.canViewProducts),
    staleTime: 5 * 60 * 1000,
  });
}

export function useProductBrands() {
  const { request, contextTag } = useStoreRequest();
  const { data } = useSessionContext();
  return useQuery({
    queryKey: productsKeys.brands(contextTag),
    queryFn: ({ signal }) => request<ProductBrandListResponse>('/products/brands', { signal }),
    enabled: Boolean(contextTag && data?.currentStore?.canViewProducts),
    staleTime: 5 * 60 * 1000,
  });
}

// Each top-level category, then the ones under it, labelled "Clothing > T-shirts".
export function categoryOptions(categories: ProductCategoryResponse[]) {
  const top = categories.filter((category) => category.parentId === null);
  return top.flatMap((parent) => [
    { value: parent.id, label: parent.name },
    ...categories
      .filter((category) => category.parentId === parent.id)
      .map((child) => ({
        value: child.id,
        label: `${parent.name}${CATEGORY_PATH_SEPARATOR}${child.name}`,
      })),
  ]);
}

// Every category (with its parent) and brand by id, for showing what an edit changes.
export function useListNames(): Map<string, string> {
  const { data: categories } = useProductCategories();
  const { data: brands } = useProductBrands();
  return new Map([
    ...categoryOptions(categories?.items ?? []).map(({ value, label }) => [value, label] as const),
    ...(brands?.items ?? []).map(({ id, name }) => [id, name] as const),
  ]);
}
