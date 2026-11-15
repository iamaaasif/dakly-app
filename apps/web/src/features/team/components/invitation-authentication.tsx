import type { ReactNode } from 'react';
import { Button } from '@dakly/ui/button';
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
      {failed ? (
        <div role="alert">
          <p>Could not check your account.</p>
          <Button onClick={onRetry}>Retry</Button>
        </div>
      ) : null}
      <fieldset disabled={checking || failed} inert={checking || failed}>
        {children}
      </fieldset>
    </>
  );
}
