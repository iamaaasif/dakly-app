import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { type Dispatch, type SetStateAction, useCallback, useRef, useState } from 'react';

import type { SessionContext } from '@dakly/contracts/sessions';
import { ApiError } from '@dakly/ui/api-client';

import { sessionContextKey, useSessionContext } from './session-context';

async function discardAccountCache(client: QueryClient) {
  await client.cancelQueries();
  client.removeQueries({ predicate: (query) => query.queryKey[0] !== sessionContextKey[0] });
  client.getMutationCache().clear();
}

// An expired session keeps the screen mounted so a half-filled form keeps its values.
function isAuthRequired(error: unknown) {
  return error instanceof ApiError && error.code === 'AUTH_REQUIRED';
}

const freshContextQuery = { queryKey: sessionContextKey, staleTime: 0 };

type DiscardOptions = {
  client: QueryClient;
  pause: () => number;
  setAvailable: (value: boolean) => void;
  setGeneration: Dispatch<SetStateAction<number>>;
};

function useAccountDiscard({ client, pause, setAvailable, setGeneration }: DiscardOptions) {
  const discard = useCallback(async () => {
    setAvailable(false);
    setGeneration((value) => value + 1);
    await discardAccountCache(client);
  }, [client, setAvailable, setGeneration]);
  const close = useCallback(async () => {
    pause();
    await discard();
  }, [pause, discard]);
  return { discard, close };
}

export function useSessionVerification() {
  const session = useSessionContext();
  const client = useQueryClient();
  const [blocked, setBlocked] = useState(true);
  const [available, setAvailable] = useState(false);
  const [failure, setFailure] = useState('');
  const [expired, setExpired] = useState(false);
  const [generation, setGeneration] = useState(0);
  const revision = useRef(0);
  const acceptedContextTag = useRef<string | undefined>(undefined);
  const switching = useRef(false);
  const pause = useCallback(() => {
    setBlocked(true);
    return ++revision.current;
  }, []);
  const { discard, close } = useAccountDiscard({ client, pause, setAvailable, setGeneration });
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
      setExpired(false);
    } catch (error) {
      if (revision.current !== current) return;
      if (isAuthRequired(error)) setExpired(true);
      else setFailure('Could not verify your account and shop. Refresh to continue.');
    }
  }, [client, pause, discard]);
  return {
    session,
    client,
    blocked,
    available,
    failure,
    expired: expired && available,
    setFailure,
    generation,
    close,
    pause,
    verify,
    switching,
    acceptedContextTag,
  };
}
