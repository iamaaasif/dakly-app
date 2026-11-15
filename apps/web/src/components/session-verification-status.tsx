import Link from 'next/link';
import { Button } from '@dakly/ui/button';
import { ApiError } from '@dakly/ui/api-client';

type SessionVerificationStatusProps = {
  failure: string;
  error: Error | null;
  onRetry: () => Promise<void>;
};
export function SessionVerificationStatus({
  failure,
  error,
  onRetry,
}: SessionVerificationStatusProps) {
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
