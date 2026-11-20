import { Plus, RefreshCw } from 'lucide-react';

import { Badge } from '@dakly/ui/badge';
import { Button } from '@dakly/ui/button';

import type { SocialAccount } from '../api/get-social-accounts';
import { accountTypeLabels } from '../social-labels';
import { NetworkIcon } from './network-icon';

type ConnectedChannelsProps = {
  accounts: SocialAccount[];
  canConnect: boolean;
  onConnect: () => void;
  onReconnect: (account: SocialAccount) => void;
};

export function ConnectedChannels({
  accounts,
  canConnect,
  onConnect,
  onReconnect,
}: ConnectedChannelsProps) {
  return (
    <section
      aria-labelledby="connected-channels"
      className="rounded-lg border border-border bg-surface"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 p-4 md:px-6">
        <div>
          <h2 id="connected-channels" className="text-lg font-semibold">
            Connected channels
          </h2>
          <p className="text-sm text-text-muted">
            {accounts.length === 1
              ? '1 account connected'
              : `${accounts.length} accounts connected`}
          </p>
        </div>
        {canConnect && (
          <Button variant="secondary" onClick={onConnect}>
            <Plus aria-hidden="true" size={16} strokeWidth={1.75} /> Connect account
          </Button>
        )}
      </header>
      <ul className="divide-y divide-border border-t border-border">
        {accounts.map((account) => (
          <AccountRow
            key={account.id}
            account={account}
            canConnect={canConnect}
            onReconnect={() => onReconnect(account)}
          />
        ))}
        <li className="flex items-center gap-3 px-4 py-3 md:px-6">
          <NetworkIcon kind="tiktok" />
          <div>
            <p className="font-semibold">TikTok</p>
            <p className="text-sm text-text-muted">
              Coming soon. Schedule TikTok videos from Dakly.
            </p>
          </div>
        </li>
      </ul>
    </section>
  );
}

type AccountRowProps = { account: SocialAccount; canConnect: boolean; onReconnect: () => void };

function AccountRow({ account, canConnect, onReconnect }: AccountRowProps) {
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3 md:px-6">
      <NetworkIcon kind={account.kind} />
      <div className="min-w-40 flex-1">
        <p className="font-semibold break-words">{account.displayName}</p>
        <p className="text-sm text-text-muted">{accountTypeLabels[account.kind]}</p>
      </div>
      {account.status === 'needs_reconnect' ? (
        <>
          <Badge variant="danger">Access expired</Badge>
          {canConnect && (
            <Button variant="secondary" onClick={onReconnect}>
              <RefreshCw aria-hidden="true" size={16} strokeWidth={1.75} /> Reconnect
            </Button>
          )}
        </>
      ) : (
        <Badge variant="success">Connected</Badge>
      )}
    </li>
  );
}
