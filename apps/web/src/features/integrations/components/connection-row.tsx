import type { ChannelConnection } from '@dakly/contracts/channels';
import { Badge } from '@dakly/ui/badge';
import { Button } from '@dakly/ui/button';

import { formatDate } from '@/lib/format-date';

const expiryWarningMs = 7 * 24 * 60 * 60 * 1000;

type ConnectionRowProps = {
  connection: ChannelConnection;
  canEdit: boolean;
  onReconnect: () => void;
  onDisconnect: () => void;
};

export function ConnectionRow({
  connection,
  canEdit,
  onReconnect,
  onDisconnect,
}: ConnectionRowProps) {
  const now = new Date();
  const expiring = isExpiring(connection, now.getTime());
  const needsReconnect = connection.status === 'needs_reconnect';
  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <div className="min-w-48 flex-1">
        <p className="flex flex-wrap items-center gap-2 font-semibold">
          <span className="wrap-anywhere">{connection.displayName}</span>
          <Badge variant={needsReconnect ? 'warning' : 'success'}>
            {needsReconnect ? 'Needs reconnect' : 'Connected'}
          </Badge>
          {expiring ? <Badge variant="warning">Access ends soon</Badge> : null}
        </p>
        <p className="text-sm text-text-muted">{rowNote(connection, expiring, now)}</p>
      </div>
      {canEdit ? (
        <div className="flex gap-2">
          {needsReconnect || expiring ? (
            <Button variant={needsReconnect ? 'primary' : 'secondary'} onClick={onReconnect}>
              Reconnect
            </Button>
          ) : null}
          <Button variant="secondary" onClick={onDisconnect}>
            Disconnect
          </Button>
        </div>
      ) : null}
    </li>
  );
}

function isExpiring({ status, tokenExpiresAt }: ChannelConnection, now: number) {
  return (
    status === 'active' &&
    tokenExpiresAt !== null &&
    Date.parse(tokenExpiresAt) - now < expiryWarningMs
  );
}

function rowNote(connection: ChannelConnection, expiring: boolean, now: Date) {
  const today = now.toISOString();
  if (connection.status === 'needs_reconnect')
    return 'Facebook no longer accepts this connection. Messages are paused until you reconnect.';
  if (expiring && connection.tokenExpiresAt)
    return `Facebook access ends: ${formatDate(connection.tokenExpiresAt, today)}. Reconnect to keep messages coming in.`;
  return `Connected: ${formatDate(connection.connectedAt, today)}`;
}
