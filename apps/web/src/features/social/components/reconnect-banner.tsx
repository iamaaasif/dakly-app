import { TriangleAlert } from 'lucide-react';
import Link from 'next/link';

import { buttonVariants } from '@dakly/ui/button';

import type { SocialAccount } from '../api/get-social-accounts';
import { formatShortDate } from '@/lib/format-date';

type ReconnectBannerProps = { account: SocialAccount; canReconnect: boolean };

// Reconnecting happens on Integrations, which owns the Meta sign-in.
export function ReconnectBanner({ account, canReconnect }: ReconnectBannerProps) {
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
          Access to {account.displayName} expired{expiredAt ? ` on ${expiredAt}` : ''}. Scheduled{' '}
          {label} posts won’t publish until you reconnect.
        </p>
      </div>
      {canReconnect && (
        <Link href="/integrations" className={buttonVariants({ variant: 'secondary' })}>
          Reconnect {label}
        </Link>
      )}
    </section>
  );
}
