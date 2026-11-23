'use client';
import type { GoogleSignInResponse } from '@dakly/contracts/auth';

import type { AuthConfig } from '../auth.types';
import { AuthFrame } from './auth-frame';
import { AuthLink } from './auth-link';
import { SignInForm } from './sign-in-form';
import { SignInNavigation } from './sign-in-navigation';
import { SignInSocial } from './sign-in-social';
import { SocialConsentNote } from './social-consent-note';

export type SignInView = 'phone' | 'email' | 'signup';
type SignInMainProps = {
  config: AuthConfig;
  method: 'phone' | 'email';
  next?: string;
  remember: boolean;
  embedded: boolean;
  onRemember: (remember: boolean) => void;
  onResult: (result: GoogleSignInResponse) => void;
  onNavigate?: (view: SignInView) => void;
  // Shown above the form, such as why Facebook sign-in did not finish.
  notice?: string;
};
// An invitation keeps the older wording; the standalone page follows the v4 design.
const invitedCopy = {
  title: 'Sign in to Dakly',
  subtitle: 'Welcome back. Sign in with your mobile number or email.',
  submit: 'Sign in',
};
const pageCopy = {
  title: 'Log in to Dakly',
  subtitle: 'Welcome back. Your customers are waiting.',
  submit: 'Log in',
};
export function SignInMain({
  config,
  method,
  next,
  remember,
  embedded,
  onRemember,
  onResult,
  onNavigate,
  notice,
}: SignInMainProps) {
  const copy = embedded ? invitedCopy : pageCopy;
  return (
    <AuthFrame
      title={copy.title}
      subtitle={copy.subtitle}
      embedded={embedded}
      aside={
        embedded ? undefined : (
          <p>
            New to Dakly? <AuthLink href="/sign-up">Create a free account</AuthLink>
          </p>
        )
      }
    >
      <div className="space-y-6">
        {notice ? (
          <p role="alert" className="rounded-control bg-danger-soft px-3.5 py-3 text-danger">
            {notice}
          </p>
        ) : null}
        <SignInSocial config={config} remember={remember} embedded={embedded} onResult={onResult} />
        {embedded ? <SignInNavigation method={method} next={next} onNavigate={onNavigate} /> : null}
        <SignInForm
          key={method}
          method={method}
          isRemembered={remember}
          onResult={onResult}
          onRemember={onRemember}
          showCode={embedded}
          submitLabel={copy.submit}
        />
        {config.legal && (config.googleClientId || !embedded) ? (
          <SocialConsentNote
            legal={config.legal}
            providers={socialProviders(Boolean(config.googleClientId), embedded)}
          />
        ) : null}
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

function socialProviders(hasGoogle: boolean, embedded: boolean) {
  if (!hasGoogle) return 'Facebook';
  return embedded ? 'Google' : 'Google or Facebook';
}
