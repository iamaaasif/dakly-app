import type { ReactNode } from 'react';
import { QueryError } from '@dakly/ui/query-error';
export function InvitationAuthentication({
  checking,
  failed,
  onRetry,
  children,
}: {
  checking: boolean;
  failed: boolean;
  onRetry: () => void;
  children: ReactNode;
}) {
  return (
    <>
      <p>
        Sign in or create an account to accept your invitation. Keep this page open; reloading
        clears the link.
      </p>
      {checking ? <p role="status">Checking your account…</p> : null}
      {failed ? <QueryError message="Could not check your account." onRetry={onRetry} /> : null}
      <fieldset disabled={checking || failed} inert={checking || failed}>
        {children}
      </fieldset>
    </>
  );
}
