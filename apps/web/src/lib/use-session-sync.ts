import { type QueryClient } from '@tanstack/react-query';
import { type RefObject, useCallback, useEffect, useRef } from 'react';

import type { SessionContext } from '@dakly/contracts/sessions';

import { sessionContextKey } from './session-context';

type SessionSyncOptions = {
  close: () => Promise<void>;
  verify: () => Promise<void>;
  client: QueryClient;
  switching: RefObject<boolean>;
  blocked: boolean;
  acceptedContextTag: RefObject<string | undefined>;
};

function useQuietVerify({
  verify,
  client,
  switching,
  blocked,
  acceptedContextTag,
}: SessionSyncOptions) {
  const blockedRef = useRef(blocked);
  blockedRef.current = blocked;
  // Focus and tab switches check the context without hiding the shell; only a real change blocks it.
  return useCallback(async () => {
    if (switching.current || blockedRef.current) return verify();
    try {
      const fresh = await client.fetchQuery<SessionContext>({
        queryKey: sessionContextKey,
        staleTime: 0,
      });
      if (fresh.contextTag !== acceptedContextTag.current) await verify();
    } catch {
      await verify();
    }
  }, [verify, client, switching, acceptedContextTag]);
}

export function useSessionSync(options: SessionSyncOptions) {
  const { close, verify } = options;
  const verifyQuietly = useQuietVerify(options);
  const channel = useRef<BroadcastChannel | null>(null);
  const changing = useRef(false);
  useEffect(() => {
    const connection = new BroadcastChannel('dakly-session');
    channel.current = connection;
    void verifyQuietly();
    connection.onmessage = (event: MessageEvent<string>) => {
      if (event.data === 'changing') {
        changing.current = true;
        void close();
      }
      if (event.data === 'changed') {
        changing.current = false;
        void verify();
      }
    };
    const visible = () => {
      if (document.visibilityState === 'visible' && !changing.current) void verifyQuietly();
    };
    const refresh = () => {
      if (!changing.current) void verifyQuietly();
    };
    window.addEventListener('dakly-context-changed', refresh);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', visible);
    return () => {
      connection.close();
      channel.current = null;
      window.removeEventListener('dakly-context-changed', refresh);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [close, verify, verifyQuietly]);
  return {
    channel,
    resume: () => {
      changing.current = false;
      return verify();
    },
  };
}
