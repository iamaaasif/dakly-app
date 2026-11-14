'use client';
import { useState } from 'react';
import Link from 'next/link';
import type { SignUpInput } from '@dakly/contracts/auth';
import type { AuthConfig } from '../auth.types';
import { AuthFrame } from './auth-frame';
import { SignUpAccount } from './sign-up-account';
import { SignUpVerify } from './sign-up-verify';
export function SignUpScreen({
  config,
  signupTicket,
  isRemembered = false,
}: {
  config: AuthConfig;
  signupTicket?: string;
  isRemembered?: boolean;
}) {
  const [account, setAccount] = useState<{ registration: SignUpInput; password: string } | null>(
    null,
  );
  if (!config.legal)
    return (
      <AuthFrame title="Create an account">
        <p role="status">
          Account registration is unavailable while our published Terms and Privacy documents are
          being prepared.
        </p>
        <Link href="/sign-in" className="inline-flex min-h-10 items-center text-action underline">
          Sign in to an existing account
        </Link>
      </AuthFrame>
    );
  return (
    <AuthFrame
      title={account ? 'Verify your mobile · Step 2 of 4' : 'Create an account · Step 1 of 4'}
    >
      {account ? (
        <SignUpVerify
          account={account}
          signupTicket={signupTicket}
          isRemembered={isRemembered}
          onBack={() => setAccount(null)}
        />
      ) : (
        <SignUpAccount legal={config.legal} onSent={setAccount} />
      )}
      <Link href="/sign-in" className="inline-flex min-h-10 items-center text-action underline">
        Already have an account? Sign in
      </Link>
    </AuthFrame>
  );
}
