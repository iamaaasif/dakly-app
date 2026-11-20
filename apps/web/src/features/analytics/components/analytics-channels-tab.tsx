import { CalendarDays } from 'lucide-react';

import type { AnalyticsChannelDetail, AnalyticsView } from '@dakly/contracts/analytics';
import { formatCount, formatMoney } from '@dakly/contracts/money';
import { Card } from '@dakly/ui/card';
import { QueryError } from '@dakly/ui/query-error';
import { Skeleton } from '@dakly/ui/skeleton';

import { channelFills, channelLabels } from '../analytics-labels';
import { useAnalyticsChannels } from '../api/analytics-overview';
import { AnalyticsDownloadButton } from './analytics-download-button';
import { ChannelTile } from './channel-tile';
import { formatWholeTaka } from '@/lib/format-money';

export function AnalyticsChannelsTab({ view }: { view: AnalyticsView }) {
  const query = useAnalyticsChannels(view.period);
  if (query.isPending)
    return <Skeleton role="status" aria-label="Loading channels" className="h-64 w-full" />;
  if (query.error)
    return (
      <QueryError
        message={query.error.message}
        onRetry={() => query.refetch()}
        retryLabel="Retry channels"
      />
    );
  const { channels, social } = query.data;
  const bestReturn = Math.max(1, ...channels.map((channel) => channel.returnPerTaka ?? 0));
  return (
    <section aria-label="Channels" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-text-muted">Compare what each channel costs and earns.</p>
        <AnalyticsDownloadButton view={view} />
      </div>
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {channels.map((channel) => (
          <li key={channel.channel}>
            <ChannelCard channel={channel} bestReturn={bestReturn} />
          </li>
        ))}
        <li>
          <SocialPostsCard posts={social.posts} reach={social.reach} />
        </li>
      </ul>
    </section>
  );
}

function ChannelCard({
  channel,
  bestReturn,
}: {
  channel: AnalyticsChannelDetail;
  bestReturn: number;
}) {
  const isSms = channel.channel === 'sms';
  return (
    <Card className="flex h-full flex-col gap-4">
      <div className="flex items-center gap-3">
        <ChannelTile channel={channel.channel} />
        <div>
          <h2 className="font-semibold">{channelLabels[channel.channel]}</h2>
          <p className="text-xs text-text-muted">
            {channel.sharePercent === null
              ? 'No money from marketing yet'
              : `${channel.sharePercent}% of your marketing money`}
          </p>
        </div>
      </div>
      <div>
        <p className="text-2xl font-bold tabular-nums">
          {formatWholeTaka(BigInt(channel.revenuePoisha))}
        </p>
        <p className="text-text-muted">{formatCount(channel.orders)} orders</p>
      </div>
      <ReturnBar
        returnPerTaka={channel.returnPerTaka}
        bestReturn={bestReturn}
        barClass={channelFills[channel.channel].swatch}
      />
      <dl className="mt-auto space-y-2 text-sm">
        <Fact label="Sent" value={`${formatCount(channel.sent)} messages`} />
        <Fact
          label="Read"
          value={isSms ? 'Can’t be tracked' : percentOrDash(channel.readPercent)}
        />
        <Fact label="Tapped link" value={percentOrDash(channel.tapPercent)} />
        <Fact label="Cost per message" value={costPerMessage(channel.costPerMessagePoisha)} />
      </dl>
    </Card>
  );
}

function SocialPostsCard({ posts, reach }: { posts: number; reach: number }) {
  return (
    <Card className="flex h-full flex-col gap-4">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary"
        >
          <CalendarDays size={18} strokeWidth={1.75} />
        </span>
        <div>
          <h2 className="font-semibold">Social posts</h2>
          <p className="text-xs text-text-muted">
            {posts === 1 ? '1 post' : `${formatCount(posts)} posts`} in this period
          </p>
        </div>
      </div>
      <div>
        <p className="text-2xl font-bold tabular-nums">—</p>
        <p className="text-text-muted">Dakly links in posts are not tracked yet</p>
      </div>
      <ReturnBar returnPerTaka={null} bestReturn={1} barClass="bg-primary" />
      <dl className="mt-auto space-y-2 text-sm">
        <Fact label="Sent" value={`${formatCount(reach)} people reached`} />
        <Fact label="Read" value="—" />
        <Fact label="Tapped link" value="—" />
        <Fact label="Cost per message" value="Free" />
      </dl>
    </Card>
  );
}

function ReturnBar({
  returnPerTaka,
  bestReturn,
  barClass,
}: {
  returnPerTaka: number | null;
  bestReturn: number;
  barClass: string;
}) {
  const width =
    returnPerTaka === null ? 0 : Math.max(4, Math.round((returnPerTaka / bestReturn) * 100));
  return (
    <div className="rounded-md bg-surface-muted p-3">
      <div className="flex items-center justify-between text-sm">
        <span className="text-text-muted">Back for every ৳1</span>
        <span className="font-semibold tabular-nums">
          {returnPerTaka === null ? '—' : `৳${formatCount(returnPerTaka)}`}
        </span>
      </div>
      <span aria-hidden className="mt-2 block h-1.5 rounded-full bg-border">
        <span className={`block h-1.5 rounded-full ${barClass}`} style={{ width: `${width}%` }} />
      </span>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-text-muted">{label}</dt>
      <dd className="text-right font-medium tabular-nums">{value}</dd>
    </div>
  );
}

const percentOrDash = (value: number | null) => (value === null ? '—' : `${value}%`);

function costPerMessage(poisha: string | null) {
  if (poisha === null) return '—';
  return BigInt(poisha) === 0n ? 'Free' : formatMoney(BigInt(poisha));
}
