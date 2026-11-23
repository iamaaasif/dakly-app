'use client';
import Image from 'next/image';
import Script from 'next/script';
import { useEffect, useRef, useState, type RefObject } from 'react';

import type { GoogleSignInResponse } from '@dakly/contracts/auth';
import { cn } from '@dakly/ui/cn';

import { useGoogleSignIn } from '../api/google-sign-in';
import { authSocialClass } from './auth-control-class';

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
// Google draws its button in a frame that cannot be restyled. The design's button sits underneath
// and Google's own button is laid over it, scaled to the same box and almost invisible, so a
// click still reaches Google.
const WIDGET_WIDTH = 400;
const WIDGET_HEIGHT = 40;
function GoogleButtonFace({
  label,
  widgetRef,
  busy,
}: {
  label: string;
  widgetRef: RefObject<HTMLDivElement | null>;
  busy: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState({ x: 1, y: 1 });
  useEffect(() => {
    const node = box.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const fit = () =>
      setScale({
        x: (node.clientWidth || WIDGET_WIDTH) / WIDGET_WIDTH,
        y: (node.clientHeight || WIDGET_HEIGHT) / WIDGET_HEIGHT,
      });
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={box} className="group relative h-11.5">
      <div
        aria-hidden="true"
        className={cn(
          authSocialClass,
          'pointer-events-none absolute inset-0 group-hover:bg-background',
        )}
      >
        <Image src="/google-g.svg" alt="" width={18} height={18} />
        {label}
      </div>
      <div
        ref={widgetRef}
        inert={busy}
        className="absolute top-0 left-0 origin-top-left opacity-[0.001]"
        style={{ width: WIDGET_WIDTH, transform: `scale(${scale.x}, ${scale.y})` }}
      />
    </div>
  );
}

export function GoogleSignIn({
  clientId,
  isRemembered,
  termsVersion,
  label = 'Log in with Google',
  onResult,
}: {
  clientId: string | null;
  isRemembered: boolean;
  termsVersion?: string;
  label?: string;
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
    if (!google || !element.current) return setState('error');
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
      width: WIDGET_WIDTH,
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
      <GoogleButtonFace label={label} widgetRef={element} busy={mutation.isPending} />
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
      {pending ? <p role="status">Checking your Google account…</p> : null}
      {state === 'error' || error ? (
        <p role="alert" className="text-danger">
          {error?.message ?? 'Google sign-in could not load. Use your phone or email.'}
        </p>
      ) : null}
    </>
  );
}
