import type { z } from 'zod';

import type { SignUpCodeChannel } from '@dakly/contracts/auth';
import type { setupStoreSchema } from '@dakly/contracts/stores';

export type AuthConfig = {
  legal: { termsUrl: string; privacyUrl: string; termsVersion: string } | null;
  googleClientId: string | null;
  signupCodeChannel: SignUpCodeChannel;
};

export type BusinessDraft = Omit<z.infer<typeof setupStoreSchema>, 'planCode' | 'billingCycle'>;
