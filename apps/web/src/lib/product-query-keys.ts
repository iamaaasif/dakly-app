export const productsKeys = {
  all: ['products'] as const,
  categories: (contextTag: string | undefined) => ['products', contextTag, 'categories'] as const,
  detail: (contextTag: string | undefined, productId: string) =>
    ['products', contextTag, 'detail', productId] as const,
  import: (contextTag: string | undefined, importId: string) =>
    ['products', contextTag, 'import', importId] as const,
};
