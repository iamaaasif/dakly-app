import { Instagram, MessageCircle, type LucideIcon } from 'lucide-react';
import { useState } from 'react';

import type { ChannelConnection } from '@dakly/contracts/channels';

import { metaChannels, type MetaKind } from '../channel-labels';
import { ConnectionRow } from './connection-row';
import { DisconnectDialog } from './disconnect-dialog';

const icons: Record<MetaKind, LucideIcon> = { facebook_page: MessageCircle, instagram: Instagram };

type ChannelCardProps = {
  kind: MetaKind;
  connections: ChannelConnection[];
  canEdit: boolean;
  onNotice: (message: string) => void;
};

// Connecting and reconnecting come with the next part of CHN-5.
export function ChannelCard({ kind, connections, canEdit, onNotice }: ChannelCardProps) {
  const [disconnecting, setDisconnecting] = useState<ChannelConnection | null>(null);
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
      </div>
      {mine.length ? (
        <ul className="mt-4 divide-y divide-border border-t border-border">
          {mine.map((connection) => (
            <ConnectionRow
              key={connection.id}
              connection={connection}
              canEdit={canEdit}
              onDisconnect={() => setDisconnecting(connection)}
            />
          ))}
        </ul>
      ) : null}
      {disconnecting ? (
        <DisconnectDialog
          connection={disconnecting}
          onClose={() => setDisconnecting(null)}
          onDisconnected={() => {
            setDisconnecting(null);
            onNotice(`${disconnecting.displayName} disconnected.`);
          }}
        />
      ) : null}
    </section>
  );
}
