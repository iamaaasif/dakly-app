'use client';
import { type ReactNode, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { SessionContext } from '@dakly/contracts/sessions';
import { Button } from '@dakly/ui/button';
import { apiRequest, ApiError } from '@/lib/api-client';
import { sessionContextKey } from '@/lib/session-context';
import { useInvitationToken } from '../hooks/use-invitation-token';
import { InvitationAccept } from './invitation-accept';
import { InvitationAccepted } from './invitation-accepted';
export function InvitationGate({ renderAuth }: { renderAuth: (done: () => void) => ReactNode }) {
  const notice = useInvitationToken();
  const session = useQuery({
    queryKey: sessionContextKey,
    queryFn: () => apiRequest<SessionContext>('/me/context'),
    staleTime: 0,
    retry: false,
  });
  const [storeId, setStoreId] = useState<string>();
  if (notice.invalid)
    return (
      <p role="alert">This invitation link is invalid. Open the full link from your invitation.</p>
    );
  if (storeId && !notice.token) return <InvitationAccepted storeId={storeId} />;
  if (!notice.token)
    return (
      <p role="status">
        Open the original invitation link to continue. Reloading clears the invitation from this
        page.
      </p>
    );
  if (session.isPending || session.isFetching) return <p role="status">Checking your account…</p>;
  if (session.error instanceof ApiError && session.error.code === 'AUTH_REQUIRED')
    return (
      <>
        <p>
          Sign in or create an account to accept your invitation. Keep this page open; reloading
          clears the link.
        </p>
        {renderAuth(() => {
          void session.refetch();
        })}
      </>
    );
  if (session.error)
    return (
      <div role="alert">
        <p>Could not check your account.</p>
        <Button onClick={() => void session.refetch()}>Retry</Button>
      </div>
    );
  return (
    <InvitationAccept
      key={notice.token}
      name={session.data!.user.name}
      token={notice.token}
      onSignedOut={() => void session.refetch()}
      onAccepted={(id) => {
        notice.clear();
        setStoreId(id);
      }}
    />
  );
}
