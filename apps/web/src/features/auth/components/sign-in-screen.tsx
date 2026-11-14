'use client';
import Link from 'next/link';
import { useState } from 'react';
import type { GoogleSignInResponse } from '@dakly/contracts/auth';
import type { AuthConfig } from '../auth.types';
import { AuthFrame } from './auth-frame';
import { SignInForm } from './sign-in-form';
import { TotpStep } from './totp-step';
import { GoogleSignIn } from './google-sign-in';
import { GoogleEmail } from './google-email';
import { SignUpScreen } from './sign-up-screen';
type SignInScreenProps = { config: AuthConfig; method?: 'phone' | 'email' };
export function SignInScreen({ config, method = 'phone' }: SignInScreenProps) {
  const [pending, setPending] = useState<GoogleSignInResponse>();
  const [remember, setRemember] = useState(false);
  const result = (value: GoogleSignInResponse) =>
    value ? setPending(value) : window.location.replace('/dashboard');
  if (pending?.status === 'signup_required')
    return (
      <SignUpScreen config={config} signupTicket={pending.signupTicket} isRemembered={remember} />
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
        <nav aria-label="Sign-in method" className="flex gap-4">
          <Link
            href="/sign-in"
            aria-current={method === 'phone' ? 'page' : undefined}
            className="inline-flex min-h-10 items-center text-action underline"
          >
            Mobile
          </Link>
          <Link
            href="/sign-in?method=email"
            aria-current={method === 'email' ? 'page' : undefined}
            className="inline-flex min-h-10 items-center text-action underline"
          >
            Email
          </Link>
        </nav>
        <SignInForm
          key={method}
          method={method}
          isRemembered={remember}
          onResult={result}
          onRemember={setRemember}
        />
        <GoogleSignIn clientId={config.googleClientId} isRemembered={remember} onResult={result} />
        <Link href="/sign-up" className="inline-flex min-h-10 items-center text-action underline">
          Create an account
        </Link>
      </div>
    </AuthFrame>
  );
}
