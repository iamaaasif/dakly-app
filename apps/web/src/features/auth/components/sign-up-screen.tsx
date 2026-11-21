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
  onAuthenticated,
  onSignIn,
}: {
  config: AuthConfig;
  onAuthenticated?: () => void;
  onSignIn?: () => void;
}) {
  const embedded = Boolean(onAuthenticated);
  const [account, setAccount] = useState<{ registration: SignUpInput; password?: string } | null>(
    null,
  );
  if (!config.legal)
    return (
      <AuthFrame title="Create an account" embedded={embedded}>
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
      embedded={embedded}
      aside={
        embedded ? undefined : (
          <p>
            Already have an account? <AuthLink href="/sign-in">Sign in</AuthLink>
          </p>
        )
      }
    >
      {account ? (
        <SignUpVerify
          account={account}
          onBack={() => setAccount(null)}
          onAuthenticated={onAuthenticated}
        />
      ) : (
        <SignUpAccount legal={config.legal} onSent={setAccount} />
      )}
      {embedded || onSignIn ? (
        <AuthLink href="/sign-in" onNavigate={onSignIn}>
          Already have an account? Sign in
        </AuthLink>
      ) : null}
    </AuthFrame>
  );
}
