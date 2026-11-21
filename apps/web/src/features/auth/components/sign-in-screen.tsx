'use client';
import { useState } from 'react';

import type { GoogleSignInResponse } from '@dakly/contracts/auth';

import type { AuthConfig } from '../auth.types';
import { AuthFrame } from './auth-frame';
import { AuthLink } from './auth-link';
import { GoogleEmail } from './google-email';
import { GoogleSignIn } from './google-sign-in';
import { SignInForm } from './sign-in-form';
import { SignInNavigation } from './sign-in-navigation';
import { SignUpScreen } from './sign-up-screen';
import { TotpStep } from './totp-step';

type SignInScreenProps = {
  config: AuthConfig;
  method?: 'phone' | 'email';
  onAuthenticated?: () => void;
  onNavigate?: (view: 'phone' | 'email' | 'signup') => void;
};
export function SignInScreen({
  config,
  method = 'phone',
  onAuthenticated,
  onNavigate,
}: SignInScreenProps) {
  const [pending, setPending] = useState<GoogleSignInResponse>();
  const [remember, setRemember] = useState(true);
  const complete = onAuthenticated ?? (() => window.location.replace('/dashboard'));
  const result = (value: GoogleSignInResponse) => (value ? setPending(value) : complete());
  function returnToSignIn() {
    setPending(undefined);
    onNavigate?.('phone');
  }
  if (pending?.status === 'signup_required')
    return (
      <SignUpScreen
        config={config}
        google={{ signupTicket: pending.signupTicket, email: pending.email }}
        isRemembered={remember}
        onAuthenticated={onAuthenticated}
        onSignIn={onNavigate ? returnToSignIn : undefined}
      />
    );
  if (pending?.status === 'totp_required')
    return (
      <AuthFrame title="Sign in">
        <TotpStep challengeId={pending.challengeId} onSuccess={() => result(undefined)} />
      </AuthFrame>
    );
  if (pending?.status === 'email_verification_required')
    return (
      <AuthFrame title="Sign in">
        <GoogleEmail
          verificationTicket={pending.verificationTicket}
          isRemembered={remember}
          onResult={result}
        />
      </AuthFrame>
    );
  return (
    <AuthFrame title="Sign in">
      <div className="space-y-4">
        <SignInNavigation method={method} onNavigate={onNavigate} />
        <SignInForm
          key={method}
          method={method}
          isRemembered={remember}
          onResult={result}
          onRemember={setRemember}
        />
        <GoogleSignIn clientId={config.googleClientId} isRemembered={remember} onResult={result} />
        <AuthLink href="/sign-up" onNavigate={navigateTo(onNavigate, 'signup')}>
          Create an account
        </AuthLink>
      </div>
    </AuthFrame>
  );
}

function navigateTo(onNavigate: SignInScreenProps['onNavigate'], view: 'phone' | 'signup') {
  return onNavigate ? () => onNavigate(view) : undefined;
}
