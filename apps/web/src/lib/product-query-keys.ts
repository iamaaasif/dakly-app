export const productsKeys = {
  all: ['products'] as const,
  detail: (contextTag: string | undefined, productId: string) =>
    ['products', contextTag, 'detail', productId] as const,
};
