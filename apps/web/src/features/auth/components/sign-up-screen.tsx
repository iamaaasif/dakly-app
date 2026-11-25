'use client';
import { useState } from 'react';

import type { SignUpInput } from '@dakly/contracts/auth';

import type { AuthConfig } from '../auth.types';
import { AuthFrame } from './auth-frame';
import { AuthLink } from './auth-link';
import { SignUpAccount } from './sign-up-account';
import { SignUpFlow } from './sign-up-flow';
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
  if (!embedded) return <SignUpFlow config={{ ...config, legal: config.legal }} />;
  return (
    <AuthFrame
      title={
        account ? 'Enter your verification code · Step 2 of 4' : 'Create an account · Step 1 of 4'
      }
      subtitle={
        !account && config.signupCodeChannel === 'email'
          ? 'Use the email address from your invitation. If you were invited by mobile, ask for an email invitation.'
          : undefined
      }
      embedded={embedded}
    >
      {account ? (
        <SignUpVerify
          account={account}
          channel={config.signupCodeChannel}
          onBack={() => setAccount(null)}
          onAuthenticated={onAuthenticated}
        />
      ) : (
        <SignUpAccount
          legal={config.legal}
          channel={config.signupCodeChannel}
          onSent={setAccount}
        />
      )}
      <AuthLink href="/sign-in" onNavigate={onSignIn}>
        Already have an account? Sign in
      </AuthLink>
    </AuthFrame>
  );
}
