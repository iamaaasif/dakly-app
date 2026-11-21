'use client';
import Script from 'next/script';
import { useRef, useState } from 'react';

import type { GoogleSignInResponse } from '@dakly/contracts/auth';

import { useGoogleSignIn } from '../api/google-sign-in';

type GoogleIdentity = {
  accounts: {
    id: {
      initialize: (input: {
        client_id: string;
        callback: (response: { credential: string }) => void;
        auto_select: boolean;
      }) => void;
      renderButton: (
        element: HTMLElement,
        options: {
          type: string;
          theme: string;
          text: string;
          size: string;
          shape: string;
          width: number;
        },
      ) => void;
    };
  };
};
export function GoogleSignIn({
  clientId,
  isRemembered,
  termsVersion,
  onResult,
}: {
  clientId: string | null;
  isRemembered: boolean;
  termsVersion?: string;
  onResult: (result: GoogleSignInResponse) => void;
}) {
  const element = useRef<HTMLDivElement>(null);
  const latest = useRef({ isRemembered, termsVersion, onResult });
  latest.current = { isRemembered, termsVersion, onResult };
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const mutation = useGoogleSignIn();
  // Without a Google client id the button is left out; the other sign-in methods remain.
  if (!clientId) return null;
  function initialize() {
    const google = (window as Window & { google?: GoogleIdentity }).google;
    if (!google || !element.current) {
      setState('error');
      return;
    }
    google.accounts.id.initialize({
      client_id: clientId!,
      auto_select: false,
      callback: ({ credential }) => {
        mutation.mutate(
          {
            idToken: credential,
            isRemembered: latest.current.isRemembered,
            termsVersion: latest.current.termsVersion,
          },
          { onSuccess: (result) => latest.current.onResult(result) },
        );
      },
    });
    google.accounts.id.renderButton(element.current, {
      type: 'standard',
      theme: 'outline',
      text: 'continue_with',
      size: 'large',
      shape: 'rectangular',
      // Google accepts 200 to 400 px; the cell is narrower than that on a phone.
      width: Math.min(400, Math.max(200, Math.round(element.current.clientWidth))),
    });
    setState('ready');
  }
  return (
    <div className="min-w-0 space-y-2">
      <Script
        src="https://accounts.google.com/gsi/client"
        onReady={initialize}
        onError={() => setState('error')}
      />
      <div ref={element} className="flex min-h-10 justify-center" inert={mutation.isPending} />
      <GoogleStatus state={state} pending={mutation.isPending} error={mutation.error} />
    </div>
  );
}

function GoogleStatus({
  state,
  pending,
  error,
}: {
  state: 'loading' | 'ready' | 'error';
  pending: boolean;
  error: Error | null;
}) {
  return (
    <>
      {state === 'loading' ? <p role="status">Loading Google sign-in…</p> : null}
      {pending ? <p role="status">Checking your Google account…</p> : null}
      {state === 'error' || error ? (
        <p role="alert" className="text-danger">
          {error?.message ?? 'Google sign-in could not load. Use your phone or email.'}
        </p>
      ) : null}
    </>
  );
}
