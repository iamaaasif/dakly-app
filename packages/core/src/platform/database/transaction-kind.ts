import { AsyncLocalStorage } from 'node:async_hooks';

// Separate account and tenant connections cannot form one atomic action.
export const transactionKind = new AsyncLocalStorage<'store' | 'account'>();
