import { useSyncExternalStore } from 'react';

import type { AssistantProductChange } from '@dakly/contracts/assistant';

// A change holds the matched products, so it waits in this browser tab until the products screen
// opens its review. Anything the owner applies is still checked by the bulk edit endpoint.
let waiting: AssistantProductChange | undefined;
const listeners = new Set<() => void>();

export function handOffProductChange(change: AssistantProductChange | undefined) {
  waiting = change;
  for (const listener of listeners) listener();
}

export function useHandedOffProductChange() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => waiting,
    () => undefined,
  );
}
