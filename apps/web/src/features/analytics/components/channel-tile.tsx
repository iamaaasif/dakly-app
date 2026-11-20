import type { AnalyticsChannel } from '@dakly/contracts/analytics';
import { cn } from '@dakly/ui/cn';

import { channelTiles } from '../analytics-labels';

export function ChannelTile({ channel }: { channel: AnalyticsChannel }) {
  const { icon: Icon, tile } = channelTiles[channel];
  return (
    <span
      aria-hidden
      className={cn('flex size-10 shrink-0 items-center justify-center rounded-md', tile)}
    >
      <Icon size={18} strokeWidth={1.75} />
    </span>
  );
}
