'use client';
import { Clock } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@dakly/ui/button';
import { QueryError } from '@dakly/ui/query-error';

import { useDrafts } from '../api/get-drafts';
import { useSocialAccounts } from '../api/get-social-accounts';
import { ConnectedChannels } from './connected-channels';
import { DraftsCard } from './drafts-card';
import { HubDialogs, type HubDialog } from './hub-dialogs';
import { HubNotice } from './hub-notice';
import { ReconnectBanner } from './reconnect-banner';
import { SocialHubLoading } from './social-hub-loading';
import { useSessionContext } from '@/lib/session-context';

export function SocialHubScreen() {
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
  return <SocialHub accounts={accounts.data} drafts={drafts.data} />;
}

type SocialHubProps = {
  accounts: NonNullable<ReturnType<typeof useSocialAccounts>['data']>;
  drafts: NonNullable<ReturnType<typeof useDrafts>['data']>;
};

function SocialHub({ accounts, drafts }: SocialHubProps) {
  const { data: session } = useSessionContext();
  const [dialog, setDialog] = useState<HubDialog>(null);
  const [notice, setNotice] = useState<{ message: string; tone?: 'error' } | null>(null);
  const canEdit = Boolean(session?.currentStore?.canEditSocial);
  const canConnect = Boolean(session?.currentStore?.canEditStoreSettings);
  const reconnect = (account: (typeof accounts)[number]) =>
    setDialog({ type: 'connect', kind: account.kind, reconnecting: account });
  return (
    <main className="space-y-6 p-4 md:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold md:text-2xl">Social hub</h1>
          <p className="mt-1 text-text-muted">
            Connect your Facebook Pages and Instagram accounts, and pick up posts you’ve saved as
            drafts.
          </p>
        </div>
        {accounts.length > 0 && (
          <Button variant="secondary" onClick={() => setDialog({ type: 'schedule' })}>
            <Clock aria-hidden="true" size={16} strokeWidth={1.75} /> Posting schedule
          </Button>
        )}
      </header>
      {notice && <HubNotice message={notice.message} tone={notice.tone} />}
      <ConnectedChannels
        accounts={accounts}
        canConnect={canConnect}
        onConnect={() => setDialog({ type: 'choose-account' })}
        onReconnect={reconnect}
      />
      <DraftsCard
        drafts={drafts}
        accounts={accounts}
        canEdit={canEdit}
        onNotice={(message, tone) => setNotice({ message, tone })}
      />
      {accounts
        .filter(({ status }) => status === 'needs_reconnect')
        .map((account) => (
          <ReconnectBanner
            key={account.id}
            account={account}
            canReconnect={canConnect}
            onReconnect={() => reconnect(account)}
          />
        ))}
      <HubDialogs
        dialog={dialog}
        accounts={accounts}
        onChange={setDialog}
        onNotice={(message) => setNotice({ message })}
      />
    </main>
  );
}
