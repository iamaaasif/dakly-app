'use client';
import { type ReactNode } from 'react';

import { Skeleton } from '@dakly/ui/skeleton';

import { SessionInteraction } from './session-interaction';
import { SessionVerificationStatus } from './session-verification-status';
import { ShellFrame } from './shell-frame';
import { useSessionBoundary } from '@/lib/use-session-boundary';

export function AppShell({ bell, children }: { bell: ReactNode; children: ReactNode }) {
  const boundary = useSessionBoundary();
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
          failure={boundary.failure}
          error={error}
          onRetry={boundary.verify}
        />
      ) : null}
      <SessionInteraction.Provider value={blocked}>
        <div hidden={blocked} inert={blocked}>
          {boundary.available && data ? (
            <ShellFrame
              key={`${data.contextTag}:${boundary.generation}`}
              data={data}
              blocked={blocked}
              generation={boundary.generation}
              onSwitch={boundary.switchStore}
              onSignOut={boundary.signOut}
              bell={bell}
            >
              {children}
            </ShellFrame>
          ) : null}
        </div>
      </SessionInteraction.Provider>
    </>
  );
}
