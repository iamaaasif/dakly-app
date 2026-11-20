import type { ChannelConnection } from '@dakly/contracts/channels';
import { Button } from '@dakly/ui/button';

import { useDisconnectChannel } from '../api/disconnect-channel';
import { metaChannels, type MetaKind } from '../channel-labels';
import { SessionDialog as Dialog } from '@/components/session-dialog';

type DisconnectDialogProps = {
  connection: ChannelConnection;
  onClose: () => void;
  onDisconnected: () => void;
};

export function DisconnectDialog({ connection, onClose, onDisconnected }: DisconnectDialogProps) {
  const disconnect = useDisconnectChannel(connection.id);
  const account = metaChannels[connection.kind as MetaKind].account;
  return (
    <Dialog open title={`Disconnect ${connection.displayName}?`} onClose={onClose}>
      <p>
        Dakly stops receiving and sending messages for this {account}. Your chats and messages stay.
        You can connect it again later.
      </p>
      {disconnect.error ? (
        <p role="alert" className="mt-3 text-sm text-danger">
          {disconnect.error.message}
        </p>
      ) : null}
      <div className="mt-6 flex justify-end gap-3 border-t border-border pt-4">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="danger"
          loading={disconnect.isPending}
          onClick={() => disconnect.mutate(undefined, { onSuccess: onDisconnected })}
        >
          Disconnect
        </Button>
      </div>
    </Dialog>
  );
}
