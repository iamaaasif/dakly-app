'use client';
import { QueryError } from '@dakly/ui/query-error';
import { Skeleton } from '@dakly/ui/skeleton';

import { useProfile } from '../api/profile';
import { DevicesPanel } from './devices-panel';
import { ProfilePanel } from './profile-panel';
import { SecurityHistory } from './security-history';
import { TotpPanel } from './totp-panel';

export function SecurityContent({ tab, before }: { tab: string; before?: string }) {
  const profile = useProfile();
  if (tab === 'history') return <SecurityHistory />;
  if (tab === 'devices') return <DevicesPanel before={before} />;
  if (profile.isPending) return <Skeleton className="h-48 w-full" />;
  const Panel = tab === 'two-step' ? TotpPanel : ProfilePanel;
  return (
    <>
      {profile.error ? (
        <QueryError message={profile.error.message} onRetry={() => void profile.refetch()} />
      ) : null}
      {profile.data ? <Panel profile={profile.data} /> : null}
    </>
  );
}
