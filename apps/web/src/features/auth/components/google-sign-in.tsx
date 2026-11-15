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
        options: { type: string; text: string; size: string },
      ) => void;
    };
  };
};
export function GoogleSignIn({
  clientId,
  isRemembered,
  onResult,
}: {
  clientId: string | null;
  isRemembered: boolean;
  onResult: (result: GoogleSignInResponse) => void;
}) {
  const element = useRef<HTMLDivElement>(null);
  const latest = useRef({ isRemembered, onResult });
  latest.current = { isRemembered, onResult };
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const mutation = useGoogleSignIn();
  if (!clientId) return <p className="text-text-muted">Google sign-in is currently unavailable.</p>;
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
          { idToken: credential, isRemembered: latest.current.isRemembered },
          { onSuccess: (result) => latest.current.onResult(result) },
        );
      },
    });
    google.accounts.id.renderButton(element.current, {
      type: 'standard',
      text: 'continue_with',
      size: 'large',
    });
    setState('ready');
  }
  return (
    <div className="space-y-2">
      <Script
        src="https://accounts.google.com/gsi/client"
        onReady={initialize}
        onError={() => setState('error')}
      />
      <div ref={element} inert={mutation.isPending} />
      {state === 'loading' ? <p role="status">Loading Google sign-in…</p> : null}
      {mutation.isPending ? <p role="status">Checking your Google account…</p> : null}
      {state === 'error' || mutation.error ? (
        <p role="alert" className="text-danger">
          {mutation.error?.message ?? 'Google sign-in could not load. Use your phone or email.'}
        </p>
      ) : null}
    </div>
  );
}
