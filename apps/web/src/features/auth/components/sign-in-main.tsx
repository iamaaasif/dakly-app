'use client';
import type { GoogleSignInResponse } from '@dakly/contracts/auth';

import type { AuthConfig } from '../auth.types';
import { AuthFrame } from './auth-frame';
import { AuthLink } from './auth-link';
import { GoogleConsentNote } from './google-consent-note';
import { GoogleSignIn } from './google-sign-in';
import { SignInForm } from './sign-in-form';
import { SignInNavigation } from './sign-in-navigation';

export type SignInView = 'phone' | 'email' | 'signup';
type SignInMainProps = {
  config: AuthConfig;
  method: 'phone' | 'email';
  remember: boolean;
  embedded: boolean;
  onRemember: (remember: boolean) => void;
  onResult: (result: GoogleSignInResponse) => void;
  onNavigate?: (view: SignInView) => void;
};
export function SignInMain({
  config,
  method,
  remember,
  embedded,
  onRemember,
  onResult,
  onNavigate,
}: SignInMainProps) {
  return (
    <AuthFrame
      title="Sign in to Dakly"
      subtitle="Welcome back. Sign in with your mobile number or email."
      embedded={embedded}
      aside={
        embedded ? undefined : (
          <p>
            New to Dakly? <AuthLink href="/sign-up">Create an account</AuthLink>
          </p>
        )
      }
    >
      <div className="space-y-6">
        <SignInNavigation method={method} onNavigate={onNavigate} />
        <SignInForm
          key={method}
          method={method}
          isRemembered={remember}
          onResult={onResult}
          onRemember={onRemember}
          alternative={
            config.googleClientId ? (
              <GoogleSignIn
                clientId={config.googleClientId}
                isRemembered={remember}
                termsVersion={config.legal?.termsVersion}
                onResult={onResult}
              />
            ) : undefined
          }
        />
        {config.googleClientId && config.legal ? <GoogleConsentNote legal={config.legal} /> : null}
        {embedded ? (
          <AuthLink
            href="/sign-up"
            onNavigate={onNavigate ? () => onNavigate('signup') : undefined}
          >
            Create an account
          </AuthLink>
        ) : null}
      </div>
    </AuthFrame>
  );
}
