'use client';
import { createContext } from 'react';
// UI suspension only; verified account and shop data remain in React Query.
export const SessionInteraction = createContext(false);
