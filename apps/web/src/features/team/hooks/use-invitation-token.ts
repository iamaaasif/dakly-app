import { useEffect, useState } from 'react';
import { acceptInviteSchema } from '@dakly/contracts/team';
export function useInvitationToken() {
  const [token, setToken] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    function read() {
      const fragment = window.location.hash;
      if (!fragment) return;
      window.history.replaceState(null, '', window.location.pathname);
      const parsed = acceptInviteSchema.safeParse({ token: fragment.slice(7) });
      const valid = fragment.startsWith('#token=') && parsed.success;
      setToken(valid ? parsed.data.token : null);
      setInvalid(!valid);
    }
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);
  return { token, invalid, clear: () => setToken(null) };
}
