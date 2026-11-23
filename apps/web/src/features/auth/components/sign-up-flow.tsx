'use client';
import { useState } from 'react';

import type { GoogleSignInResponse, SignUpInput } from '@dakly/contracts/auth';

import type { AuthConfig } from '../auth.types';
import { AuthFrame } from './auth-frame';
import { AuthLink } from './auth-link';
import { SignInSocial } from './sign-in-social';
import { SignUpAccountStep, type AccountDetails } from './sign-up-account-step';
import { SignUpBusinessStep } from './sign-up-business-step';
import { SignUpVerify } from './sign-up-verify';

type Sent = { registration: SignUpInput; password: string };
const copy = {
  account: {
    title: 'Create your free account',
    subtitle: 'Free to start — no credit card required.',
  },
  business: {
    title: 'Tell us about your business',
    subtitle: 'Dakly uses this to set up the right tools for you.',
  },
  verify: {
    title: 'Enter the code we sent you',
    subtitle: 'We sent a 6-digit code by SMS to confirm your number.',
  },
};
// A new Google account is created at once; anything else finishes on the sign-in page.
const afterGoogle = (result: GoogleSignInResponse) =>
  window.location.assign(result ? '/sign-in' : '/setup');
function SignUpSocial({ config }: { config: AuthConfig }) {
  return (
    <SignInSocial
      config={config}
      remember={false}
      embedded={false}
      facebookLabel="Sign up with Facebook"
      googleLabel="Sign up with Google"
      onResult={afterGoogle}
    />
  );
}
// The standalone sign-up page: email and password, then the business, then the mobile code.
export function SignUpFlow({
  config,
}: {
  config: AuthConfig & { legal: NonNullable<AuthConfig['legal']> };
}) {
  const [account, setAccount] = useState<AccountDetails>();
  const [stage, setStage] = useState<'account' | 'business' | 'verify'>('account');
  const [sent, setSent] = useState<Sent>();
  return (
    <AuthFrame
      {...copy[stage]}
      step={stage === 'verify' ? undefined : { current: stage === 'account' ? 1 : 2, total: 2 }}
      onBack={
        stage === 'account'
          ? undefined
          : () => setStage(stage === 'verify' ? 'business' : 'account')
      }
      aside={
        stage === 'account' ? (
          <p>
            Already have an account? <AuthLink href="/sign-in">Log in</AuthLink>
          </p>
        ) : undefined
      }
    >
      {stage === 'account' ? (
        <div className="space-y-5.5">
          <SignUpSocial config={config} />
          <SignUpAccountStep
            legal={config.legal}
            initial={account}
            onNext={(details) => {
              setAccount(details);
              setStage('business');
            }}
          />
        </div>
      ) : null}
      {stage === 'business' && account ? (
        <SignUpBusinessStep
          account={account}
          legal={config.legal}
          onSent={(value) => {
            setSent(value);
            setStage('verify');
          }}
        />
      ) : null}
      {stage === 'verify' && sent ? (
        <SignUpVerify account={sent} onBack={() => setStage('business')} />
      ) : null}
    </AuthFrame>
  );
}
