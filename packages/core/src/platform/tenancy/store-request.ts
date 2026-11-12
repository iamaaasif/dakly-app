// The auth middleware (not built yet) sets storeId after verifying the session token.
// Nothing else may set it: never read a store id from the body, query or a header.
export type StoreRequest = {
  storeId?: string;
};
