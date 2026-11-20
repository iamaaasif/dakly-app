import { CheckCircle2, ShieldCheck } from 'lucide-react';
import { useState } from 'react';

import type { AccountProfile } from '@dakly/contracts/sessions';
import { Badge } from '@dakly/ui/badge';
import { Button } from '@dakly/ui/button';
import { Card } from '@dakly/ui/card';

import { useSecurityRefresh } from '../hooks/use-security-refresh';
import { BackupCodes } from './backup-codes';
import { TotpDisable } from './totp-disable';
import { TotpSetup } from './totp-setup';
import { SessionDialog } from '@/components/session-dialog';

function ProtectedBanner({ profile }: { profile: AccountProfile }) {
  if (!profile.isTotpEnabled) return null;
  return (
    <div className="flex items-center gap-3 rounded-lg border border-success/30 bg-success-soft p-4 text-sm text-text">
      <ShieldCheck className="size-5 shrink-0 text-success" aria-hidden="true" />
      <div className="space-y-1">
        <p className="font-semibold text-text">Your account is protected</p>
        <div className="flex flex-wrap items-center gap-4 text-xs text-text-muted">
          {profile.hasPassword ? (
            <span className="inline-flex items-center gap-1">
              <CheckCircle2 className="size-3.5 text-success" aria-hidden="true" />
              Password set
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1">
            <CheckCircle2 className="size-3.5 text-success" aria-hidden="true" />
            Two-step verification
          </span>
        </div>
      </div>
    </div>
  );
}

export function TotpPanel({ profile }: { profile: AccountProfile }) {
  const [editing, setEditing] = useState<'setup' | 'disable'>();
  const [codes, setCodes] = useState<string[]>();
  const refresh = useSecurityRefresh();

  return (
    <section className="space-y-6">
      <ProtectedBanner profile={profile} />

      <Card className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-text">Two-step verification</h2>
            <p className="text-xs text-text-muted">
              When you log in on a new phone or computer, we also ask for a 6-digit code.
            </p>
          </div>
          <Badge variant={profile.isTotpEnabled ? 'success' : 'neutral'}>
            {profile.isTotpEnabled ? 'On' : 'Off'}
          </Badge>
        </div>

        {codes ? (
          <BackupCodes codes={codes} onSaved={() => setCodes(undefined)} />
        ) : (
          <div className="pt-2">
            <Button
              variant={profile.isTotpEnabled ? 'danger' : 'primary'}
              onClick={() => setEditing(profile.isTotpEnabled ? 'disable' : 'setup')}
            >
              {profile.isTotpEnabled ? 'Disable two-step verification' : 'Set up authenticator'}
            </Button>
          </div>
        )}
      </Card>

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
