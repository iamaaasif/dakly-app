import type { z } from 'zod';

import type { setupStoreSchema } from '@dakly/contracts/stores';

export type AuthConfig = {
  legal: { termsUrl: string; privacyUrl: string; termsVersion: string } | null;
  googleClientId: string | null;
};

export type BusinessDraft = Omit<z.infer<typeof setupStoreSchema>, 'planCode' | 'billingCycle'>;
