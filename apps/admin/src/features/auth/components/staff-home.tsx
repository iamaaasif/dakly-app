'use client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@dakly/ui/button';
import { Skeleton } from '@dakly/ui/skeleton';
import { useStaffSession } from '../api/session';
import { useStaffSignOut } from '../api/sign-out';
import { AuthPanel } from './auth-panel';
export function StaffHome() {
  const session = useStaffSession();
  const signOut = useStaffSignOut();
  const router = useRouter();
  return (
    <AuthPanel
      title="Staff account"
      description="Your staff session is active for up to eight hours and ends after thirty minutes without activity."
    >
      {session.isPending ? <Skeleton className="h-20 w-full" /> : null}
      {session.error ? (
        <div className="space-y-3">
          <p role="alert">Your session could not be verified.</p>
          <Button onClick={() => session.refetch()}>Retry</Button>
          <Link className="text-action underline" href="/sign-in">
            Sign in
          </Link>
        </div>
      ) : null}
      {session.data ? (
        <div className="space-y-4">
          <p className="font-medium">{session.data.name}</p>
          <p className="text-muted">Role: {session.data.role.replaceAll('_', ' ')}</p>
          <Button
            loading={signOut.isPending}
            onClick={() =>
              signOut.mutate(undefined, { onSuccess: () => router.replace('/sign-in') })
            }
          >
            Sign out
          </Button>
        </div>
      ) : null}
      {signOut.error ? (
        <p role="alert" className="text-danger">
          {signOut.error.message}
        </p>
      ) : null}
    </AuthPanel>
  );
}
