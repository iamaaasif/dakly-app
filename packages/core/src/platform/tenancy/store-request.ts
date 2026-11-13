import type { StoreAccess } from '@dakly/contracts/team';

// The session layer sets these fields after checking the session and active membership.
// Only this layer may set them; never read store access from incoming request data.
export type StoreRequest = {
  storeId?: string;
  userId?: string;
  access?: StoreAccess;
};
