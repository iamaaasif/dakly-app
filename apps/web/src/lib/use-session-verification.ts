import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { sessionContextKey, useSessionContext } from './session-context';

export function useSessionVerification() {
  const session = useSessionContext();
  const client = useQueryClient();
  const [blocked, setBlocked] = useState(true);
  const [failure, setFailure] = useState('');
  const [generation, setGeneration] = useState(0);
  const revision = useRef(0);
  const switching = useRef(false);
  const close = useCallback(async () => {
    const current = ++revision.current;
    setBlocked(true);
    setGeneration((value) => value + 1);
    await client.cancelQueries();
    client.removeQueries({ predicate: (query) => query.queryKey[0] !== sessionContextKey[0] });
    client.getMutationCache().clear();
    return current;
  }, [client]);
  const verify = useCallback(async () => {
    if (switching.current) return;
    const current = await close();
    try {
      await client.fetchQuery({ queryKey: sessionContextKey, staleTime: 0 });
      if (revision.current === current) {
        setBlocked(false);
        setFailure('');
      }
    } catch {
      setFailure('Could not verify your account and shop. Refresh to continue.');
    }
  }, [client, close]);
  return { session, client, blocked, failure, setFailure, generation, close, verify, switching };
}
