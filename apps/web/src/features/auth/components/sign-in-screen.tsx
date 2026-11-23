'use client';
import { useState } from 'react';

import type { GoogleSignInResponse } from '@dakly/contracts/auth';

import type { AuthConfig } from '../auth.types';
import { AuthFrame } from './auth-frame';
import { GoogleEmail } from './google-email';
import { SignInMain, type SignInView } from './sign-in-main';
import { TotpStep } from './totp-step';

type SignInScreenProps = {
  config: AuthConfig;
  method?: 'phone' | 'email';
  next?: string;
  onAuthenticated?: () => void;
  onNavigate?: (view: SignInView) => void;
  // Where the Facebook redirect left the browser: a reason it stopped, or a two-step challenge.
  facebook?: { reason?: string; challengeId?: string };
};
export function SignInScreen({
  config,
  method = 'phone',
  next,
  onAuthenticated,
  onNavigate,
  facebook,
}: SignInScreenProps) {
  const [pending, setPending] = useState<GoogleSignInResponse | undefined>(
    facebook?.challengeId
      ? { status: 'totp_required', challengeId: facebook.challengeId }
      : undefined,
  );
  const [remember, setRemember] = useState(true);
  const embedded = Boolean(onAuthenticated);
  const complete = onAuthenticated ?? (() => window.location.replace(next ?? '/dashboard'));
  const result = (value: GoogleSignInResponse) => (value ? setPending(value) : complete());
  if (pending)
    return (
      <AuthFrame title="Sign in" embedded={embedded}>
        {pending.status === 'totp_required' ? (
          <TotpStep challengeId={pending.challengeId} onSuccess={() => result(undefined)} />
        ) : (
          <GoogleEmail
            verificationTicket={pending.verificationTicket}
            isRemembered={remember}
            onResult={result}
          />
        )}
      </AuthFrame>
    );
  return (
    <SignInMain
      config={config}
      method={method}
      next={next}
      remember={remember}
      embedded={embedded}
      onRemember={setRemember}
      onResult={result}
      onNavigate={onNavigate}
      notice={facebookNotice(facebook?.reason)}
    />
  );
}

const facebookNotices: Record<string, string> = {
  terms_required:
    'Agree to the Terms and Privacy documents on the sign-up page to create an account.',
  email_required:
    'Facebook did not share an email address. Sign up with your email and mobile number instead.',
  expired: 'That Facebook sign-in expired. Please try again.',
  unavailable: 'Facebook sign-in is not available right now. Use Google or your email.',
  conflict: 'This Facebook account is already linked to another Dakly account.',
  disabled: 'This account is disabled. Contact Dakly support.',
  rate_limited: 'Too many attempts. Wait a few minutes and try again.',
  failed: 'Facebook sign-in did not finish. Please try again.',
};
function facebookNotice(reason?: string) {
  return reason ? facebookNotices[reason] : undefined;
}
