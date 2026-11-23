import type { SignUpSource } from '@dakly/contracts/auth';
import type { GoogleIdentity } from '@dakly/providers/google/google-identity-driver';

import type { SignInSubject } from './sign-in-failures';

// A phone sign-up has a verified phone; a Google sign-up has only the Google email.
export type NewAccount = {
  name: string;
  phone?: string;
  email?: string;
  termsVersion: string;
  source?: SignUpSource;
  sourceOther?: string;
};
export type SignInRequest = { ip: string; userAgent?: string; isRemembered: boolean };
// A pending registration is inserted in the same account transaction as its first session.
export type SignInUser = {
  id: string;
  target: string;
  kind?: 'email';
  deliveryEmail?: string;
  passwordState?: string;
  registration?: NewAccount;
  registrationPasswordHash?: string;
  google?: {
    identity: GoogleIdentity;
    mode: 'subject' | 'link' | 'signup';
    expectedEmailVerifiedAt?: string;
    expectedUnlinked?: true;
  };
};

export function signInSubject(
  target: string,
  userId?: string,
  email?: string | null,
): SignInSubject {
  return { target, userId, phone: target, email: email?.toLowerCase() };
}
