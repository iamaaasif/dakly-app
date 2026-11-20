import { TriangleAlert } from 'lucide-react';

import { Button } from '@dakly/ui/button';

import type { SocialAccount } from '../api/get-social-accounts';
import { formatShortDate } from '@/lib/format-date';

type ReconnectBannerProps = {
  account: SocialAccount;
  canReconnect: boolean;
  scheduledCount?: number;
  onReconnect: () => void;
};

export function ReconnectBanner({
  account,
  canReconnect,
  scheduledCount,
  onReconnect,
}: ReconnectBannerProps) {
  const label = account.kind === 'instagram' ? 'Instagram' : 'Facebook';
  const expiredAt = account.tokenExpiresAt ? formatShortDate(account.tokenExpiresAt) : null;
  return (
    <section
      aria-label={`Reconnect ${account.displayName}`}
      className="flex flex-wrap items-center gap-4 rounded-lg border border-danger bg-danger-soft p-4"
    >
      <TriangleAlert aria-hidden="true" size={24} strokeWidth={1.75} className="text-danger" />
      <div className="min-w-48 flex-1">
        <h2 className="font-semibold">Reconnect {label} to keep posting</h2>
        <p className="text-sm text-text-muted">
          Access to {account.displayName} expired{expiredAt ? ` on ${expiredAt}` : ''}.{' '}
          {scheduledCount
            ? `${scheduledCount} scheduled ${label} ${scheduledCount === 1 ? 'post' : 'posts'} won’t`
            : `Scheduled ${label} posts won’t`}{' '}
          publish until you reconnect.
        </p>
      </div>
      {canReconnect && (
        <Button variant="secondary" onClick={onReconnect}>
          Reconnect {label}
        </Button>
      )}
    </section>
  );
}
