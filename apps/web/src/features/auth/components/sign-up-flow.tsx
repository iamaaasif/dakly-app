'use client';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';

import type { GoogleSignInResponse, SignUpInput } from '@dakly/contracts/auth';

import { useCreateFirstShop } from '../api/create-first-shop';
import type { AuthConfig } from '../auth.types';
import { firstShopInput, type BusinessDetails } from '../first-shop';
import { AuthFrame } from './auth-frame';
import { AuthLink } from './auth-link';
import { SignInSocial } from './sign-in-social';
import { SignUpAccountStep, type AccountDetails } from './sign-up-account-step';
import { SignUpBusinessStep } from './sign-up-business-step';
import { SignUpVerify } from './sign-up-verify';

type Sent = { registration: SignUpInput; password: string; shop: BusinessDetails };
const copy = {
  account: {
    title: 'Create your free account',
    subtitle: 'Free to start — no credit card required.',
  },
  business: {
    title: 'Tell us about your business',
    subtitle: 'Dakly uses this to set up the right tools for you.',
  },
  creating: {
    title: 'Setting up your shop',
    subtitle: 'This takes a few seconds.',
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
type Stage = 'account' | 'business' | 'verify' | 'creating';
type LegalConfig = AuthConfig & { legal: NonNullable<AuthConfig['legal']> };

// The account exists once the code is right. If the shop cannot be created, the setup screen
// asks for it the usual way, so the owner is never stuck.
function useOpenFirstShop(onStart: () => void) {
  const createShop = useCreateFirstShop();
  return async (shop: BusinessDetails) => {
    onStart();
    try {
      await createShop.mutateAsync(firstShopInput(shop));
      window.location.replace('/dashboard');
    } catch {
      window.location.replace('/setup');
    }
  };
}

function frameFor(stage: Stage, setStage: (stage: Stage) => void) {
  const steps: Partial<Record<Stage, number>> = { account: 1, business: 2 };
  const back: Partial<Record<Stage, Stage>> = { business: 'account', verify: 'business' };
  const previous = back[stage];
  return {
    step: steps[stage] ? { current: steps[stage], total: 2 } : undefined,
    onBack: previous ? () => setStage(previous) : undefined,
    aside:
      stage === 'account' ? (
        <p>
          Already have an account? <AuthLink href="/sign-in">Log in</AuthLink>
        </p>
      ) : undefined,
  };
}

// The standalone sign-up page: email and password, then the business, then the mobile code.
export function SignUpFlow({ config }: { config: LegalConfig }) {
  const [account, setAccount] = useState<AccountDetails>();
  const [stage, setStage] = useState<Stage>('account');
  const [sent, setSent] = useState<Sent>();
  const openShop = useOpenFirstShop(() => setStage('creating'));
  return (
    <AuthFrame {...copy[stage]} {...frameFor(stage, setStage)}>
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
        <SignUpVerify
          account={sent}
          onBack={() => setStage('business')}
          onAuthenticated={() => void openShop(sent.shop)}
        />
      ) : null}
      {stage === 'creating' ? <ShopSetup /> : null}
    </AuthFrame>
  );
}

function ShopSetup() {
  return (
    <div role="status" className="flex items-center gap-3 text-text-muted">
      <Loader2 aria-hidden="true" size={20} className="animate-spin" />
      Creating your account and shop…
    </div>
  );
}
