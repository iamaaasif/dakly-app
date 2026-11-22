'use client';
import { useEffect, useRef, useState } from 'react';

import { metaLoginMessageType } from '@/components/meta-connect/meta-login-message';

// Facebook sends the shop back here. The page passes the result to the Integrations tab and closes.
export default function MetaLoginReturnPage() {
  const [handedOver, setHandedOver] = useState(true);
  const sent = useRef(false);
  useEffect(() => {
    // Development mounts effects twice; a second message would reuse a code and state Meta already spent.
    if (sent.current) return;
    sent.current = true;
    const params = new URLSearchParams(window.location.search);
    const state = params.get('state');
    const code = params.get('code');
    const message =
      state && code
        ? { type: metaLoginMessageType, state, code }
        : { type: metaLoginMessageType, error: params.get('error') ?? 'missing_code' };
    if (!window.opener) return setHandedOver(false);
    (window.opener as Window).postMessage(message, window.location.origin);
    window.close();
  }, []);
  return (
    <main className="p-6 text-center">
      <p role="status">
        {handedOver
          ? 'Done. You can close this window.'
          : 'Open Integrations in Dakly and connect again from there.'}
      </p>
    </main>
  );
}
