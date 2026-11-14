'use client';
import { type ReactNode } from 'react';
import Link from 'next/link';
import { Button } from '@dakly/ui/button';
import { Skeleton } from '@dakly/ui/skeleton';
import { useSessionBoundary } from '@/lib/use-session-boundary';
import { ApiError } from '@/lib/api-client';
import { ShellFrame } from './shell-frame';

export function AppShell({ children }: { children: ReactNode }) {
  const boundary = useSessionBoundary();
  const { data, error, isPending } = boundary.session;
  if (isPending)
    return (
      <div role="status" className="space-y-6 p-6">
        <p>Loading your account…</p>
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  if (error || boundary.blocked || !data)
    return (
      <div className="space-y-4 p-6">
        <p role="alert">
          {boundary.failure || error?.message || 'Verifying your account and shop…'}
        </p>
        <Button onClick={() => void boundary.verify()}>Refresh</Button>
        {error instanceof ApiError && error.code === 'AUTH_REQUIRED' ? (
          <Link href="/sign-in" className="inline-flex min-h-10 items-center text-action underline">
            Sign in
          </Link>
        ) : null}
      </div>
    );
  return (
    <ShellFrame
      data={data}
      generation={boundary.generation}
      onSwitch={boundary.switchStore}
      onSignOut={boundary.signOut}
    >
      {children}
    </ShellFrame>
  );
}
