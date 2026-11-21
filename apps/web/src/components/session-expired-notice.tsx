'use client';
import { signInPath } from '@/lib/safe-next-path';

// Opens in a new tab so the form behind this notice keeps what the person typed.
export function SessionExpiredNotice() {
  const here = `${window.location.pathname}${window.location.search}`;
  return (
    <div role="alert" className="space-y-2 border-b border-border bg-surface-muted p-4">
      <p className="font-semibold">Your session has expired.</p>
      <p>
        Your changes are still on this page but are not saved. Sign in again in a new tab, then come
        back here and save.
      </p>
      <a
        href={signInPath(here)}
        target="_blank"
        rel="noopener"
        className="inline-flex min-h-10 items-center font-semibold text-action underline"
      >
        Sign in
      </a>
    </div>
  );
}
