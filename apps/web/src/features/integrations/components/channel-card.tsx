import { useQueryClient } from '@tanstack/react-query';
import { Instagram, MessageCircle, type LucideIcon } from 'lucide-react';
import { useState } from 'react';

import type { ChannelConnection } from '@dakly/contracts/channels';
import { Button } from '@dakly/ui/button';

import { integrationsKeys } from '../api/integrations-keys';
import { ConnectionRow } from './connection-row';
import { DisconnectDialog } from './disconnect-dialog';
import { metaChannels, type MetaKind } from '@/components/meta-connect/channel-labels';
import { MetaConnectDialog } from '@/components/meta-connect/meta-connect-dialog';

const icons: Record<MetaKind, LucideIcon> = { facebook_page: MessageCircle, instagram: Instagram };

type DialogState =
  | { type: 'connect'; reconnecting?: ChannelConnection }
  | { type: 'disconnect'; of: ChannelConnection }
  | null;

type ChannelCardProps = {
  kind: MetaKind;
  connections: ChannelConnection[];
  canEdit: boolean;
  onNotice: (message: string) => void;
};

export function ChannelCard({ kind, connections, canEdit, onNotice }: ChannelCardProps) {
  const [dialog, setDialog] = useState<DialogState>(null);
  const channel = metaChannels[kind];
  const mine = connections.filter(
    (connection) => connection.kind === kind && connection.status !== 'disconnected',
  );
  const Icon = icons[kind];
  return (
    <section
      aria-label={channel.name}
      className="rounded-lg border border-border bg-surface p-4 md:p-6"
    >
      <div className="flex flex-wrap items-center gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-md bg-primary-soft text-action">
          <Icon aria-hidden="true" size={24} strokeWidth={1.75} />
        </span>
        <div className="min-w-48 flex-1">
          <h3 className="text-lg font-semibold">{channel.name}</h3>
          <p className="text-sm text-text-muted">{channel.description}</p>
        </div>
        {canEdit ? (
          <Button
            variant={mine.length ? 'secondary' : 'primary'}
            onClick={() => setDialog({ type: 'connect' })}
          >
            {mine.length ? `Add ${channel.account}` : channel.connect}
          </Button>
        ) : null}
      </div>
      {mine.length ? (
        <ul className="mt-4 divide-y divide-border border-t border-border">
          {mine.map((connection) => (
            <ConnectionRow
              key={connection.id}
              connection={connection}
              canEdit={canEdit}
              onReconnect={() => setDialog({ type: 'connect', reconnecting: connection })}
              onDisconnect={() => setDialog({ type: 'disconnect', of: connection })}
            />
          ))}
        </ul>
      ) : null}
      <ChannelDialog
        kind={kind}
        dialog={dialog}
        connections={connections}
        onClose={() => setDialog(null)}
        onNotice={onNotice}
      />
    </section>
  );
}

type ChannelDialogProps = {
  kind: MetaKind;
  dialog: DialogState;
  connections: ChannelConnection[];
  onClose: () => void;
  onNotice: (message: string) => void;
};

function ChannelDialog({ kind, dialog, connections, onClose, onNotice }: ChannelDialogProps) {
  const client = useQueryClient();
  if (dialog?.type === 'connect')
    return (
      <MetaConnectDialog
        kind={kind}
        reconnecting={dialog.reconnecting}
        connections={connections}
        onClose={onClose}
        onConnected={(count) => {
          void client.invalidateQueries({ queryKey: integrationsKeys.all });
          onClose();
          onNotice(
            count === 1
              ? `${metaChannels[kind].account} connected.`
              : `${count} accounts connected.`,
          );
        }}
      />
    );
  if (dialog?.type === 'disconnect')
    return (
      <DisconnectDialog
        connection={dialog.of}
        account={metaChannels[kind].account}
        onClose={onClose}
        onDisconnected={() => {
          onClose();
          onNotice(`${dialog.of.displayName} disconnected.`);
        }}
      />
    );
  return null;
}
