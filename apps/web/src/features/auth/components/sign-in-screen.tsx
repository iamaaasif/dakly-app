'use client';
import { useState } from 'react';

import type { GoogleSignInResponse } from '@dakly/contracts/auth';

import type { AuthConfig } from '../auth.types';
import { AuthFrame } from './auth-frame';
import { GoogleEmail } from './google-email';
import { SignInMain, type SignInView } from './sign-in-main';
import { SignUpScreen } from './sign-up-screen';
import { TotpStep } from './totp-step';

type SignInScreenProps = {
  config: AuthConfig;
  method?: 'phone' | 'email';
  onAuthenticated?: () => void;
  onNavigate?: (view: SignInView) => void;
};
export function SignInScreen({
  config,
  method = 'phone',
  onAuthenticated,
  onNavigate,
}: SignInScreenProps) {
  const [pending, setPending] = useState<GoogleSignInResponse>();
  const [remember, setRemember] = useState(true);
  const embedded = Boolean(onAuthenticated);
  const complete = onAuthenticated ?? (() => window.location.replace('/dashboard'));
  const result = (value: GoogleSignInResponse) => (value ? setPending(value) : complete());
  if (pending?.status === 'signup_required')
    return (
      <SignUpScreen
        config={config}
        google={{ signupTicket: pending.signupTicket, email: pending.email }}
        isRemembered={remember}
        onAuthenticated={onAuthenticated}
        onSignIn={
          onNavigate
            ? () => {
                setPending(undefined);
                onNavigate('phone');
              }
            : undefined
        }
      />
    );
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
      remember={remember}
      embedded={embedded}
      onRemember={setRemember}
      onResult={result}
      onNavigate={onNavigate}
    />
  );
}
