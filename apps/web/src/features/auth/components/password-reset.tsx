'use client';
import { ArrowRight, Check } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { SignInResponse } from '@dakly/contracts/auth';

import { AuthFrame } from './auth-frame';
import { ResetCodeStep } from './reset-code-step';
import { ResetEmailStep } from './reset-email-step';
import { ResetPasswordStep } from './reset-password-step';
import { TotpStep } from './totp-step';

type Step = 'email' | 'code' | 'password' | 'two-step' | 'done';
const copy: Record<Step, { title: string; subtitle?: string }> = {
  email: {
    title: 'Reset your password',
    subtitle: 'Enter the email on your account. We’ll email you a code to reset your password.',
  },
  code: { title: 'Check your email', subtitle: 'Use the code to reset your password.' },
  password: {
    title: 'Create a new password',
    subtitle: 'Use at least 8 characters, with a number.',
  },
  'two-step': { title: 'Reset your password' },
  done: {
    title: 'Password updated',
    subtitle: 'You’re signed in on this device. We signed you out of your other sessions.',
  },
};
export function PasswordReset() {
  const [step, setStep] = useState<Step>('email');
  const [identifier, setIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState('');
  const back = { email: () => window.location.assign('/sign-in'), code: () => setStep('email') }[
    step as 'email' | 'code'
  ];
  function finish(result: SignInResponse) {
    if (result) {
      setChallenge(result.challengeId);
      setStep('two-step');
    } else setStep('done');
  }
  return (
    <AuthFrame
      {...copy[step]}
      onBack={step === 'password' ? () => setStep('code') : back}
      headingIcon={step === 'done' ? <ResetSuccessIcon /> : undefined}
      centerHeading={step === 'done'}
    >
      {step === 'email' ? (
        <ResetEmailStep
          onSent={(value) => {
            setIdentifier(value);
            setStep('code');
          }}
        />
      ) : null}
      {step === 'code' ? (
        <ResetCodeStep
          identifier={identifier}
          onChange={() => setStep('email')}
          onCode={(value) => {
            setCode(value);
            setStep('password');
          }}
        />
      ) : null}
      {step === 'password' ? (
        <ResetPasswordStep
          identifier={identifier}
          code={code}
          onReset={finish}
          onBadCode={() => setStep('code')}
        />
      ) : null}
      {step === 'two-step' ? (
        <TotpStep challengeId={challenge} onSuccess={() => setStep('done')} />
      ) : null}
      {step === 'done' ? <ResetDone /> : null}
    </AuthFrame>
  );
}

function ResetDone() {
  useEffect(() => {
    const timer = window.setTimeout(() => window.location.replace('/dashboard'), 3000);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <a
      href="/dashboard"
      className="mx-auto flex min-h-12 w-full max-w-88 items-center justify-center gap-2 rounded-control bg-action px-4 font-semibold text-on-primary hover:bg-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      Continue to dashboard
      <ArrowRight aria-hidden="true" size={16} />
    </a>
  );
}

function ResetSuccessIcon() {
  return (
    <span
      aria-hidden="true"
      className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-success-soft text-success"
    >
      <Check size={26} />
    </span>
  );
}
