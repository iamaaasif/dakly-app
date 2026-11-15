'use client';
import { useState } from 'react';

import type { SignUpInput } from '@dakly/contracts/auth';

import type { AuthConfig } from '../auth.types';
import { AuthFrame } from './auth-frame';
import { AuthLink } from './auth-link';
import { SignUpAccount } from './sign-up-account';
import { SignUpVerify } from './sign-up-verify';

export function SignUpScreen({
  config,
  signupTicket,
  isRemembered = false,
  onAuthenticated,
  onSignIn,
}: {
  config: AuthConfig;
  signupTicket?: string;
  isRemembered?: boolean;
  onAuthenticated?: () => void;
  onSignIn?: () => void;
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
        <AuthLink href="/sign-in" onNavigate={onSignIn}>
          Sign in to an existing account
        </AuthLink>
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
          onAuthenticated={onAuthenticated}
        />
      ) : (
        <SignUpAccount legal={config.legal} onSent={setAccount} />
      )}
      <AuthLink href="/sign-in" onNavigate={onSignIn}>
        Already have an account? Sign in
      </AuthLink>
    </AuthFrame>
  );
}
