import Link from 'next/link';

import { ApiError } from '@dakly/ui/api-client';
import { Button } from '@dakly/ui/button';

import { SessionExpiredNotice } from './session-expired-notice';

type SessionVerificationStatusProps = {
  expired: boolean;
  failure: string;
  error: Error | null;
  onRetry: () => Promise<void>;
};
export function SessionVerificationStatus({
  expired,
  failure,
  error,
  onRetry,
}: SessionVerificationStatusProps) {
  if (expired) return <SessionExpiredNotice />;
  return (
    <div className="space-y-4 p-6">
      <p role="alert">{failure || error?.message || 'Verifying your account and shop…'}</p>
      <Button onClick={() => void onRetry()}>Refresh</Button>
      {error instanceof ApiError && error.code === 'AUTH_REQUIRED' ? (
        <Link href="/sign-in" className="inline-flex min-h-10 items-center text-action underline">
          Sign in
        </Link>
      ) : null}
    </div>
  );
}
