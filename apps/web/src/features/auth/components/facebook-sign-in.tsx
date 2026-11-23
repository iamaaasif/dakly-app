'use client';
import { useState } from 'react';

import { cn } from '@dakly/ui/cn';

import { authSocialClass } from './auth-control-class';

// TODO(backend): Facebook sign-in has no API yet, see frontend-polish-backend-todo.md.
// The button looks live so the screen matches the design; pressing it says why nothing happens.
export function FacebookSignIn({ label }: { label: string }) {
  const [noticed, setNoticed] = useState(false);
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setNoticed(true)}
        className={cn(
          authSocialClass,
          'hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
        )}
      >
        <span
          aria-hidden="true"
          className="flex size-4.5 items-end justify-center overflow-hidden rounded-full bg-facebook text-sm leading-none font-bold text-on-primary"
        >
          f
        </span>
        {label}
      </button>
      {noticed ? (
        <p role="status" className="text-sm text-text-muted">
          Facebook sign-in is not available yet. Use Google or your email.
        </p>
      ) : null}
    </div>
  );
}
