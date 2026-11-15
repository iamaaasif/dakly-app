'use client';
import Link from 'next/link';

import { QueryError } from '@dakly/ui/query-error';
import { Skeleton } from '@dakly/ui/skeleton';

import { useProfile } from '../api/profile';
import { DevicesPanel } from './devices-panel';
import { ProfilePanel } from './profile-panel';
import { SecurityHistory } from './security-history';
import { TotpPanel } from './totp-panel';

const sections = [
  ['profile', 'My profile'],
  ['devices', 'Devices'],
  ['two-step', 'Two-step verification'],
  ['history', 'Security history'],
] as const;
export function SecurityScreen({ tab, before }: { tab: string; before?: string }) {
  return (
    <main className="max-w-3xl space-y-6 p-4 md:p-8">
      <h1 className="text-xl font-bold">Security</h1>
      <p>These settings belong to your account across all shops.</p>
      <nav aria-label="Security sections" className="flex flex-wrap gap-4">
        {sections.map(([value, label]) => (
          <Link
            key={value}
            href={`/security?tab=${value}`}
            aria-current={value === tab ? 'page' : undefined}
            className="inline-flex min-h-10 items-center text-action underline"
          >
            {label}
          </Link>
        ))}
      </nav>
      <SecurityContent tab={tab} before={before} />
    </main>
  );
}

function SecurityContent({ tab, before }: { tab: string; before?: string }) {
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
