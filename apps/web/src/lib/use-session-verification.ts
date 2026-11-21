import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';

import type { SessionContext } from '@dakly/contracts/sessions';
import { ApiError } from '@dakly/ui/api-client';

import { sessionContextKey, useSessionContext } from './session-context';

const freshContextQuery = { queryKey: sessionContextKey, staleTime: 0 };

export function useSessionVerification() {
  const session = useSessionContext();
  const client = useQueryClient();
  const [blocked, setBlocked] = useState(true);
  const [available, setAvailable] = useState(false);
  const [failure, setFailure] = useState('');
  const [generation, setGeneration] = useState(0);
  const revision = useRef(0);
  const acceptedContextTag = useRef<string | undefined>(undefined);
  const switching = useRef(false);
  const pause = useCallback(() => {
    setBlocked(true);
    return ++revision.current;
  }, []);
  const discard = useCallback(async () => {
    setAvailable(false);
    setGeneration((value) => value + 1);
    await client.cancelQueries();
    client.removeQueries({ predicate: (query) => query.queryKey[0] !== sessionContextKey[0] });
    client.getMutationCache().clear();
  }, [client]);
  const close = useCallback(async () => {
    pause();
    await discard();
  }, [pause, discard]);
  const verify = useCallback(async () => {
    if (switching.current) return;
    const current = pause();
    await client.cancelQueries({ queryKey: sessionContextKey });
    if (revision.current !== current) return;
    try {
      const verified = await client.fetchQuery<SessionContext>(freshContextQuery);
      if (revision.current !== current) return;
      if (acceptedContextTag.current !== verified.contextTag) await discard();
      if (revision.current !== current) return;
      acceptedContextTag.current = verified.contextTag;
      setAvailable(true);
      setBlocked(false);
      setFailure('');
    } catch (error) {
      if (revision.current !== current) return;
      await failVerification(error, discard, setFailure);
    }
  }, [client, pause, discard]);
  return {
    session,
    client,
    blocked,
    available,
    failure,
    setFailure,
    generation,
    close,
    pause,
    verify,
    switching,
  };
}

async function failVerification(
  error: unknown,
  discard: () => Promise<void>,
  setFailure: (message: string) => void,
) {
  if (error instanceof ApiError && error.code === 'AUTH_REQUIRED') {
    // Expired, signed out in another tab or revoked from the devices list.
    await discard();
    window.location.assign('/sign-in');
    return;
  }
  setFailure('Could not verify your account and shop. Refresh to continue.');
}
