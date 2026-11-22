'use client';
import { type ReactNode } from 'react';

import type { SessionContext } from '@dakly/contracts/sessions';
import { Skeleton } from '@dakly/ui/skeleton';

import { SessionInteraction } from './session-interaction';
import { SessionVerificationStatus } from './session-verification-status';
import { ShellFrame } from './shell-frame';
import { useSessionBoundary } from '@/lib/use-session-boundary';

type AppShellProps = { initialContext: SessionContext; actions: ReactNode; children: ReactNode };

// The server just verified this context, so the first paint shows the real shell; a quiet check follows.
export function AppShell({ initialContext, actions, children }: AppShellProps) {
  const boundary = useSessionBoundary(initialContext);
  const { data, error, isPending } = boundary.session;
  if (isPending && !boundary.available)
    return (
      <div role="status" className="space-y-6 p-6">
        <p>Loading your account…</p>
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  const blocked = Boolean(error || boundary.blocked || !data);
  return (
    <>
      {blocked ? (
        <SessionVerificationStatus
          expired={boundary.expired}
          failure={boundary.failure}
          error={error}
          onRetry={boundary.verify}
        />
      ) : null}
      <SessionInteraction.Provider value={blocked}>
        <div hidden={blocked && !boundary.expired} inert={blocked}>
          {boundary.available && data ? (
            <ShellFrame
              key={`${data.contextTag}:${boundary.generation}`}
              data={data}
              blocked={blocked}
              generation={boundary.generation}
              onSwitch={boundary.switchStore}
              onSignOut={boundary.signOut}
              actions={actions}
            >
              {children}
            </ShellFrame>
          ) : null}
        </div>
      </SessionInteraction.Provider>
    </>
  );
}
