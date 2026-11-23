'use client';
import { Check } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

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
  done: { title: 'Password updated', subtitle: 'You can now sign in with your new password.' },
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
    <AuthFrame {...copy[step]} onBack={step === 'password' ? () => setStep('code') : back}>
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
  return (
    <div className="space-y-4">
      <span
        aria-hidden="true"
        className="flex size-12 items-center justify-center rounded-full bg-success-soft text-success"
      >
        <Check size={20} />
      </span>
      <Link
        href="/sign-in"
        className="flex min-h-11 w-full items-center justify-center rounded-md bg-action font-semibold text-on-primary hover:bg-action-hover"
      >
        Log in
      </Link>
    </div>
  );
}
