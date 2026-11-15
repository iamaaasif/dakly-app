import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { SessionContext } from '@dakly/contracts/sessions';
import { ApiError } from '@dakly/ui/api-client';
import { apiRequest } from '@/lib/api-client';
import { sessionContextKey } from '@/lib/session-context';
export function useInvitationSession() {
  const session = useQuery({
    queryKey: sessionContextKey,
    queryFn: () => apiRequest<SessionContext>('/me/context'),
    staleTime: 0,
    retry: false,
  });
  // An anonymous query becomes pending on refetch; retain only the mounted auth phase.
  const [authenticating, setAuthenticating] = useState(false);
  const anonymous = session.error instanceof ApiError && session.error.code === 'AUTH_REQUIRED';
  useEffect(() => {
    if (session.isFetching) return;
    if (anonymous) setAuthenticating(true);
    else if (session.isSuccess) setAuthenticating(false);
  }, [anonymous, session.isFetching, session.isSuccess]);
  return {
    session,
    showAuth: authenticating && !session.isSuccess,
    checking: session.isPending || session.isFetching || anonymous,
    authFailed: !session.isFetching && !anonymous,
  };
}
