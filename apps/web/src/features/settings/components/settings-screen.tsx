'use client';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { cn } from '@dakly/ui/cn';

import { SettingsContent } from './settings-content';
import { useSessionContext } from '@/lib/session-context';

type SettingsLink = { href: string; label: string; current?: boolean };

// The SMS tab's content comes from the integrations feature, so the page passes it in.
export function SettingsScreen({ tab, sms }: { tab: 'store' | 'sms'; sms?: ReactNode }) {
  const { data } = useSessionContext();
  const access = data?.currentStore;
  const account: SettingsLink[] = [
    { href: '/security?tab=profile', label: 'My profile' },
    { href: '/security?tab=two-step', label: 'Security' },
    { href: '/team/ownership', label: 'Ownership transfer' },
    ...(access?.canApproveSupport ? [{ href: '/support-access', label: 'Support access' }] : []),
  ];
  const store: SettingsLink[] = [
    { href: '/settings?tab=store', label: 'Store information', current: tab === 'store' },
    { href: '/settings?tab=sms', label: 'SMS settings', current: tab === 'sms' },
  ];
  const subtitle = {
    store: 'Your store details, shown on messages and invoices.',
    sms: 'Your store details and how Dakly sends SMS, WhatsApp and email for you.',
  }[tab];

  return (
    <main className="space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-xl font-bold md:text-2xl">Store settings</h1>
        <p className="mt-1 text-sm text-text-muted">{subtitle}</p>
      </div>
      <div className="grid gap-6 md:grid-cols-[14rem_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="space-y-4">
          <SettingsGroup heading="Account" links={account} />
          {access?.canViewStoreSettings ? <SettingsGroup heading="Store" links={store} /> : null}
        </nav>
        <div className="max-w-4xl">
          <SettingsBody tab={tab} sms={sms} />
        </div>
      </div>
    </main>
  );
}

function SettingsBody({ tab, sms }: { tab: 'store' | 'sms'; sms: ReactNode }) {
  const { data } = useSessionContext();
  const access = data?.currentStore;
  if (!access?.canViewStoreSettings)
    return <p role="status">Store details need Store settings access.</p>;
  if (tab === 'sms') return sms;
  return <SettingsContent />;
}

function SettingsGroup({ heading, links }: { heading: string; links: SettingsLink[] }) {
  return (
    <div className="space-y-1">
      <p className="px-2 text-xs font-semibold tracking-wide text-text-muted uppercase">
        {heading}
      </p>
      <ul className="space-y-1">
        {links.map(({ href, label, current }) => (
          <li key={href}>
            <Link
              href={href}
              aria-current={current ? 'page' : undefined}
              className={cn(
                'flex min-h-10 items-center rounded-md p-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
                current
                  ? 'bg-primary-soft font-semibold text-action-hover'
                  : 'hover:bg-surface-muted',
              )}
            >
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
