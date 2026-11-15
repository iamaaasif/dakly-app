import { BackupCodes } from './backup-codes';
import { useState } from 'react';
import type { AccountProfile } from '@dakly/contracts/sessions';
import { Button } from '@dakly/ui/button';
import { SessionDialog } from '@/components/session-dialog';
import { useSecurityRefresh } from '../hooks/use-security-refresh';
import { TotpSetup } from './totp-setup';
import { TotpDisable } from './totp-disable';
export function TotpPanel({ profile }: { profile: AccountProfile }) {
  const [editing, setEditing] = useState<'setup' | 'disable'>();
  const [codes, setCodes] = useState<string[]>();
  const refresh = useSecurityRefresh();
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Two-step verification</h2>
      {codes ? (
        <BackupCodes codes={codes} onSaved={() => setCodes(undefined)} />
      ) : (
        <>
          <p>
            {profile.isTotpEnabled
              ? 'Your authenticator protects sign-in.'
              : 'Add an authenticator to protect sign-in with a second step.'}
          </p>
          <Button onClick={() => setEditing(profile.isTotpEnabled ? 'disable' : 'setup')}>
            {profile.isTotpEnabled ? 'Disable two-step verification' : 'Set up authenticator'}
          </Button>
        </>
      )}
      {editing ? (
        <SessionDialog
          open
          title={editing === 'setup' ? 'Set up authenticator' : 'Disable two-step verification'}
          onClose={() => setEditing(undefined)}
        >
          {editing === 'setup' ? (
            <TotpSetup
              profile={profile}
              onConfirmed={(backupCodes) => {
                setCodes(backupCodes);
                setEditing(undefined);
                void refresh();
              }}
            />
          ) : (
            <TotpDisable
              onDone={() => {
                setEditing(undefined);
                void refresh();
              }}
            />
          )}
        </SessionDialog>
      ) : null}
    </section>
  );
}
