'use client';
import { type ReactNode, useState } from 'react';
import { QueryError } from '@dakly/ui/query-error';
import { useInvitationToken } from '../hooks/use-invitation-token';
import { useInvitationSession } from '../hooks/use-invitation-session';
import { InvitationAccept } from './invitation-accept';
import { InvitationAccepted } from './invitation-accepted';
import { InvitationAuthentication } from './invitation-authentication';
export function InvitationGate({ renderAuth }: { renderAuth: (done: () => void) => ReactNode }) {
  const notice = useInvitationToken();
  const { session, showAuth, checking, authFailed } = useInvitationSession();
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
  if (showAuth)
    return (
      <InvitationAuthentication
        checking={session.isFetching}
        failed={authFailed}
        onRetry={() => void session.refetch()}
      >
        {renderAuth(() => void session.refetch())}
      </InvitationAuthentication>
    );
  if (checking) return <p role="status">Checking your account…</p>;
  if (session.error)
    return (
      <QueryError message="Could not check your account." onRetry={() => void session.refetch()} />
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
