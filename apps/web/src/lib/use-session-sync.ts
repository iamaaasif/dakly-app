import { useEffect, useRef } from 'react';

export function useSessionSync({
  close,
  pause,
  verify,
}: {
  close: () => Promise<void>;
  pause: () => number;
  verify: () => Promise<void>;
}) {
  const channel = useRef<BroadcastChannel | null>(null);
  const changing = useRef(false);
  useEffect(() => {
    const connection = new BroadcastChannel('dakly-session');
    channel.current = connection;
    void verify();
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
      if (document.visibilityState === 'visible' && !changing.current) void verify();
      else pause();
    };
    const refresh = () => {
      if (!changing.current) void verify();
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
  }, [close, pause, verify]);
  return {
    channel,
    resume: () => {
      changing.current = false;
      return verify();
    },
  };
}
