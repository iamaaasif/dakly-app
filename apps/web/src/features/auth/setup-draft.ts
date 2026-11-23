import { setupStoreSchema } from '@dakly/contracts/stores';

import type { BusinessDraft } from './auth.types';

const businessSchema = setupStoreSchema.omit({ planCode: true, billingCycle: true });
const keyFor = (userId: string) => `dakly-setup-draft:${userId}`;

// The draft lives only in this tab so a reload does not lose the business details.
export function loadSetupDraft(userId: string): BusinessDraft | undefined {
  try {
    const stored = window.sessionStorage.getItem(keyFor(userId));
    const parsed = businessSchema.safeParse(stored ? JSON.parse(stored) : undefined);
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export function saveSetupDraft(userId: string, draft: BusinessDraft): void {
  try {
    window.sessionStorage.setItem(keyFor(userId), JSON.stringify(draft));
  } catch {
    /* Private windows can refuse storage; the form still works. */
  }
}

export function clearSetupDraft(userId: string): void {
  try {
    window.sessionStorage.removeItem(keyFor(userId));
  } catch {
    /* Nothing was stored. */
  }
}
