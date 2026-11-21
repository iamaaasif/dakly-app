export const shopsKeys = {
  list: (query: string) => ['admin-shops', query] as const,
  detail: (storeId: string) => ['admin-shop', storeId] as const,
};
