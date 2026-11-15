import type { CreateStoreInput } from '@dakly/contracts/stores';
export type AuthConfig = {
  legal: { termsUrl: string; privacyUrl: string; termsVersion: string } | null;
  googleClientId: string | null;
};

export type BusinessDraft = Omit<CreateStoreInput, 'planCode' | 'billingCycle'>;
