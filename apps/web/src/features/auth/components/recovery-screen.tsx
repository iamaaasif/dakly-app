'use client';
import { useEffect, useState } from 'react';
import { totpRecoveryTokenSchema, type TotpRecoveryTokenInput } from '@dakly/contracts/totp';
import { RecoveryCancel } from './recovery-cancel';
import { RecoveryNavigation } from './recovery-navigation';
import { AuthFrame } from './auth-frame';
import { RecoveryRequest } from './recovery-request';
import { RecoveryComplete } from './recovery-complete';
export function RecoveryScreen({ view = 'request' }: { view?: 'request' | 'complete' }) {
  const [notice, setNotice] = useState<TotpRecoveryTokenInput | null>(null);
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    function readNotice() {
      const fragment = window.location.hash;
      if (!fragment) return;
      window.history.replaceState(null, '', window.location.pathname);
      const values = new URLSearchParams(fragment.slice(1));
      const result = totpRecoveryTokenSchema.safeParse({
        recoveryId: values.get('recoveryId'),
        token: values.get('cancelToken'),
      });
      setInvalid(!result.success);
      setNotice(result.success ? result.data : null);
    }
    readNotice();
    window.addEventListener('hashchange', readNotice);
    return () => window.removeEventListener('hashchange', readNotice);
  }, []);
  let content = view === 'complete' ? <RecoveryComplete /> : <RecoveryRequest />;
  if (invalid)
    content = (
      <p role="alert" className="text-danger">
        This recovery link is invalid. Open the full link from your security notice.
      </p>
    );
  if (notice) content = <RecoveryCancel key={notice.recoveryId} notice={notice} />;
  return (
    <AuthFrame title="Recover two-step verification">
      {content}
      <RecoveryNavigation
        onNavigate={() => {
          setNotice(null);
          setInvalid(false);
        }}
      />
    </AuthFrame>
  );
}
