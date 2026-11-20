import type { ChannelConnection } from '@dakly/contracts/channels';
import { Badge } from '@dakly/ui/badge';
import { Button } from '@dakly/ui/button';

import { formatDate } from '@/lib/format-date';

type ConnectionRowProps = {
  connection: ChannelConnection;
  canEdit: boolean;
  onDisconnect: () => void;
};

export function ConnectionRow({ connection, canEdit, onDisconnect }: ConnectionRowProps) {
  const needsReconnect = connection.status === 'needs_reconnect';
  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <div className="min-w-48 flex-1">
        <p className="flex flex-wrap items-center gap-2 font-semibold">
          <span className="wrap-anywhere">{connection.displayName}</span>
          <Badge variant={needsReconnect ? 'warning' : 'success'}>
            {needsReconnect ? 'Needs reconnect' : 'Connected'}
          </Badge>
        </p>
        <p className="text-sm text-text-muted">{note(connection)}</p>
      </div>
      {canEdit ? (
        <Button variant="secondary" onClick={onDisconnect}>
          Disconnect
        </Button>
      ) : null}
    </li>
  );
}

function note(connection: ChannelConnection) {
  if (connection.status === 'needs_reconnect')
    return 'Facebook no longer accepts this connection. Messages are paused until you reconnect.';
  const date = formatDate(connection.connectedAt, new Date().toISOString());
  return `Connected ${date === 'Today' || date === 'Yesterday' ? date.toLowerCase() : `on ${date}`}`;
}
