import type { AdminShopDetail } from '@dakly/contracts/admin-shops';
import { formatMoney } from '@dakly/contracts/money';
import { Card } from '@dakly/ui/card';

import { formatDate } from '@/lib/format-date';

const words = (value: string) => value.replaceAll('_', ' ');

function PlanCard({ subscription }: { subscription: AdminShopDetail['subscription'] }) {
  return (
    <Card className="space-y-1">
      <h2 className="font-semibold">Plan</h2>
      {subscription ? (
        <>
          <p>
            {subscription.planName}, {subscription.billingCycle},{' '}
            {formatMoney(subscription.pricePoisha)}
          </p>
          <p className="text-muted">
            {subscription.trialEndsAt ? `Trial ends ${formatDate(subscription.trialEndsAt)}. ` : ''}
            Current period ends {formatDate(subscription.currentPeriodEnd)}.
            {subscription.isCancellationScheduled ? ' Cancellation is scheduled.' : ''}
          </p>
        </>
      ) : (
        <p>No subscription.</p>
      )}
    </Card>
  );
}

function TeamCard({ team }: { team: AdminShopDetail['team'] }) {
  return (
    <Card className="space-y-2">
      <h2 className="font-semibold">Owner and team</h2>
      <ul className="space-y-1">
        {team.map((member) => (
          <li key={`${member.name}-${member.phoneMasked}`}>
            {member.name} <span className="text-muted">{member.role ?? 'custom role'}</span>{' '}
            {member.phoneMasked}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ChannelsCard({ channels }: { channels: AdminShopDetail['channels'] }) {
  return (
    <Card className="space-y-2">
      <h2 className="font-semibold">Channels</h2>
      {channels.length === 0 ? <p>No channels connected.</p> : null}
      <ul className="space-y-1">
        {channels.map((channel) => (
          <li key={`${channel.kind}-${channel.displayName}`}>
            {channel.displayName}{' '}
            <span className="text-muted">
              {words(channel.kind)}, {words(channel.status)}, AI{' '}
              {channel.isAiLive ? 'live' : 'in practice mode'}
              {channel.whatsappQualityRating ? `, quality ${channel.whatsappQualityRating}` : ''}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function ShopOverview({ shop }: { shop: AdminShopDetail }) {
  return (
    <div className="space-y-4 pt-4">
      <PlanCard subscription={shop.subscription} />
      <TeamCard team={shop.team} />
      <ChannelsCard channels={shop.channels} />
      <Card className="space-y-1">
        <h2 className="font-semibold">Extensions</h2>
        <p>{shop.extensions.length ? shop.extensions.map(words).join(', ') : 'None'}</p>
      </Card>
    </div>
  );
}
