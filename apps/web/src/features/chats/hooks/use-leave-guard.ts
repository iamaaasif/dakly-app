import { useState } from 'react';

import type { LeaveRequest } from '../components/agent-settings-save-bar';

// Closing or switching tabs would drop typed settings, so the first attempt asks and the second goes.
export function useLeaveGuard() {
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState<(() => void) | null>(null);
  const guard = (action: () => void) => (dirty ? setPending(() => action) : action());
  const leave: LeaveRequest | null = pending
    ? {
        discard: () => {
          setPending(null);
          pending();
        },
        keep: () => setPending(null),
      }
    : null;
  return { dirty, setDirty, guard, leave };
}
