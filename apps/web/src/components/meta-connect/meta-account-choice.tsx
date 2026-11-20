import { useState } from 'react';

import type {
  ChannelConnection,
  MetaAuthorizationAccounts,
  MetaSelectionInput,
} from '@dakly/contracts/channels';
import { Button } from '@dakly/ui/button';

import { metaChannels, type MetaKind } from './channel-labels';
import { SessionDialog as Dialog } from '@/components/session-dialog';

type MetaAccountChoiceProps = {
  kind: MetaKind;
  accounts: MetaAuthorizationAccounts;
  connections: ChannelConnection[];
  reconnecting?: ChannelConnection;
  pending: boolean;
  error?: string;
  onClose: () => void;
  onChoose: (accounts: MetaSelectionInput['accounts']) => void;
};

export function MetaAccountChoice(props: MetaAccountChoiceProps) {
  const { kind, accounts, connections, reconnecting, pending, error, onClose, onChoose } = props;
  const [chosen, setChosen] = useState<string[]>(
    reconnecting?.kind === kind ? [reconnecting.externalAccountId] : [],
  );
  const rows = accounts.pages.flatMap((page) => {
    const account = kind === 'facebook_page' ? page : page.instagram;
    return account ? [account] : [];
  });
  const statusOf = (id: string) =>
    connections.find(
      (connection) =>
        connection.kind === kind &&
        connection.externalAccountId === id &&
        connection.status !== 'disconnected',
    )?.status;
  const toggle = (id: string, on: boolean) =>
    setChosen((current) => (on ? [...current, id] : current.filter((item) => item !== id)));
  return (
    <Dialog
      open
      title={`Choose ${kind === 'facebook_page' ? 'Pages' : 'Instagram accounts'}`}
      onClose={onClose}
    >
      <p className="text-sm text-text-muted">You can connect more than one.</p>
      <AccountList kind={kind} rows={rows} statusOf={statusOf} chosen={chosen} onToggle={toggle} />
      {error ? (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="mt-6 flex justify-end gap-3 border-t border-border pt-4">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          loading={pending}
          disabled={chosen.length === 0}
          onClick={() => onChoose(chosen.map((externalAccountId) => ({ kind, externalAccountId })))}
        >
          Connect
        </Button>
      </div>
    </Dialog>
  );
}

function accountNote(kind: MetaKind, status: ChannelConnection['status'] | undefined) {
  if (status === 'active') return 'Already connected';
  if (status === 'needs_reconnect') return 'Needs reconnecting';
  return metaChannels[kind].account;
}

function emptyNote(kind: MetaKind) {
  return kind === 'instagram'
    ? 'None of your Pages has an Instagram account linked. Link it in Instagram settings first.'
    : 'Facebook did not list any Page you manage.';
}

type AccountListProps = {
  kind: MetaKind;
  rows: { id: string; name: string }[];
  statusOf: (id: string) => ChannelConnection['status'] | undefined;
  chosen: string[];
  onToggle: (id: string, on: boolean) => void;
};

function AccountList({ kind, rows, statusOf, chosen, onToggle }: AccountListProps) {
  if (!rows.length) return <p className="mt-4 text-sm">{emptyNote(kind)}</p>;
  return (
    <ul className="mt-4 divide-y divide-border rounded-md border border-border">
      {rows.map(({ id, name }) => {
        const taken = statusOf(id) === 'active';
        return (
          <li key={id}>
            <label className={`flex items-start gap-3 p-3 ${taken ? 'text-text-muted' : ''}`}>
              <input
                type="checkbox"
                className="mt-1 size-4 accent-action"
                disabled={taken}
                checked={taken || chosen.includes(id)}
                onChange={(event) => onToggle(id, event.target.checked)}
              />
              <span>
                <span className="block text-sm font-semibold">{name}</span>
                <span className="block text-xs text-text-muted">
                  {accountNote(kind, statusOf(id))}
                </span>
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}
