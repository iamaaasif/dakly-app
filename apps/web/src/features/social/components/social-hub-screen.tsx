'use client';
import { QueryError } from '@dakly/ui/query-error';

import { useDrafts } from '../api/get-drafts';
import { useSocialAccounts } from '../api/get-social-accounts';
import { ConnectedChannels } from './connected-channels';
import { DraftsCard } from './drafts-card';
import { ReconnectBanner } from './reconnect-banner';
import { SocialHubLoading } from './social-hub-loading';
import { useSessionContext } from '@/lib/session-context';

export function SocialHubScreen() {
  const { data: session } = useSessionContext();
  const accounts = useSocialAccounts();
  const drafts = useDrafts();
  const failed = accounts.error ?? drafts.error;
  if (failed)
    return (
      <main className="p-4 md:p-8">
        <QueryError
          message={failed.message}
          onRetry={() => void Promise.all([accounts.refetch(), drafts.refetch()])}
          retryLabel="Retry social hub"
        />
      </main>
    );
  if (!accounts.data || !drafts.data) return <SocialHubLoading />;
  const canConnect = Boolean(session?.currentStore?.canEditStoreSettings);
  return (
    <main className="space-y-6 p-4 md:p-8">
      <header>
        <h1 className="text-xl font-bold md:text-2xl">Social hub</h1>
        <p className="mt-1 text-text-muted">
          Connect your Facebook Pages and Instagram accounts, and pick up posts you’ve saved as
          drafts.
        </p>
      </header>
      <ConnectedChannels accounts={accounts.data} canConnect={canConnect} />
      <DraftsCard drafts={drafts.data} accounts={accounts.data} />
      {accounts.data
        .filter(({ status }) => status === 'needs_reconnect')
        .map((account) => (
          <ReconnectBanner key={account.id} account={account} canReconnect={canConnect} />
        ))}
    </main>
  );
}
