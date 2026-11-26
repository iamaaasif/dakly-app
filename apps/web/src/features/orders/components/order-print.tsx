import { useEffect, type ReactNode, type RefObject } from 'react';

import { SessionVerificationStatus } from '@/components/session-verification-status';
import { useSessionBoundary } from '@/lib/use-session-boundary';

export function OrderPrintSession({
  loadingMessage,
  children,
}: {
  loadingMessage: string;
  children: ReactNode;
}) {
  const boundary = useSessionBoundary();
  const { error, isPending } = boundary.session;
  if (isPending)
    return (
      <p role="status" className="p-6">
        {loadingMessage}
      </p>
    );
  if (boundary.blocked || error)
    return (
      <SessionVerificationStatus
        expired={boundary.expired}
        failure={boundary.failure}
        error={error}
        onRetry={boundary.verify}
      />
    );
  return children;
}

export function usePrintWhenReady(ready: boolean, printed: RefObject<boolean>) {
  useEffect(() => {
    if (!ready || printed.current || window.location.hash !== '#print') return;
    let cancelled = false;
    void document.fonts.ready.then(() => {
      if (cancelled || printed.current) return;
      printed.current = true;
      window.print();
    });
    return () => {
      cancelled = true;
    };
  }, [ready, printed]);
}
