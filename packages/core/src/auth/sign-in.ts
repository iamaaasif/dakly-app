import type { GoogleIdentity } from '@dakly/providers/google/google-identity-driver';
import type { SignUpInput } from '@dakly/contracts/auth';

export type SignInRequest = { ip: string; userAgent?: string; isRemembered: boolean };
// A pending registration is inserted in the same account transaction as its first session.
export type SignInUser = {
  id: string;
  target: string;
  kind?: 'email';
  deliveryEmail?: string;
  passwordState?: string;
  registration?: SignUpInput;
  registrationPasswordHash?: string;
  google?: {
    identity: GoogleIdentity;
    mode: 'subject' | 'link' | 'signup';
    expectedEmailVerifiedAt?: string;
    expectedUnlinked?: true;
  };
};
