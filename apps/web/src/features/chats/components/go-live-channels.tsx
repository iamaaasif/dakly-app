import type { ChannelConnection } from '@dakly/contracts/channels';
import { Badge } from '@dakly/ui/badge';
import { Button } from '@dakly/ui/button';

export const channelNames = {
  facebook_page: 'Messenger',
  instagram: 'Instagram',
  whatsapp: 'WhatsApp',
};

type GoLiveChannelsProps = {
  channels: ChannelConnection[];
  runningId: string | undefined;
  canEdit: boolean;
  onGoLive: (channel: ChannelConnection) => void;
};

export function GoLiveChannels({ channels, runningId, canEdit, onGoLive }: GoLiveChannelsProps) {
  if (channels.length === 0)
    return <p className="text-text-muted">Connect Messenger, Instagram or WhatsApp to go live.</p>;
  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {channels.map((channel) => (
        <li key={channel.id} className="flex flex-wrap items-center gap-3 p-3">
          <span className="min-w-0 flex-1 font-semibold">
            {channelNames[channel.kind]} · {channel.displayName}
          </span>
          <Badge variant={channel.isAiLive ? 'success' : 'warning'}>
            {channel.isAiLive ? 'Live' : 'Practice'}
          </Badge>
          {!channel.isAiLive && canEdit ? (
            <Button
              onClick={() => onGoLive(channel)}
              loading={runningId === channel.id}
              disabled={runningId !== undefined || channel.status !== 'active'}
            >
              Go live
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
