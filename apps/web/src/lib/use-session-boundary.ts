import { apiPost } from './api-client';
import { useSessionSync } from './use-session-sync';
import { useSessionVerification } from './use-session-verification';

export function useSessionBoundary() {
  const verification = useSessionVerification();
  const { session, client, close, verify, switching, setFailure } = verification;
  const { channel, resume } = useSessionSync({
    close,
    verify,
    client,
    switching,
    blocked: verification.blocked,
    acceptedContextTag: verification.acceptedContextTag,
  });
  async function switchStore(storeId: string) {
    if (switching.current) return;
    switching.current = true;
    const tag = session.data?.contextTag;
    channel.current?.postMessage('changing');
    await close();
    try {
      await apiPost('/me/active-store', { storeId }, { contextTag: tag });
      switching.current = false;
      await verify();
    } catch {
      setFailure('Could not confirm the shop switch. Refresh before continuing.');
    } finally {
      switching.current = false;
      channel.current?.postMessage('changed');
    }
  }
  async function signOut() {
    if (switching.current) return;
    switching.current = true;
    channel.current?.postMessage('changing');
    await close();
    try {
      await apiPost('/auth/sign-out', {});
      client.clear();
      window.location.assign('/sign-in');
    } catch {
      setFailure('Could not confirm sign out. Refresh before continuing.');
    } finally {
      switching.current = false;
      channel.current?.postMessage('changed');
    }
  }
  return { ...verification, verify: resume, switchStore, signOut };
}
