'use client';
import Link from 'next/link';

import { cn } from '@dakly/ui/cn';

import { SettingsContent } from './settings-content';
import { useSessionContext } from '@/lib/session-context';

type SettingsLink = { href: string; label: string; current?: boolean };

export function SettingsScreen({ tab }: { tab: 'store' | 'extensions' }) {
  const { data } = useSessionContext();
  const access = data?.currentStore;
  const account: SettingsLink[] = [
    { href: '/security', label: 'Security' },
    { href: '/team/ownership', label: 'Ownership transfer' },
    ...(access?.canApproveSupport ? [{ href: '/support-access', label: 'Support access' }] : []),
  ];
  const store: SettingsLink[] = [
    { href: '/settings?tab=store', label: 'Store information', current: tab === 'store' },
    { href: '/settings?tab=extensions', label: 'Extensions', current: tab === 'extensions' },
  ];
  return (
    <main className="space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-xl font-bold">Settings</h1>
        <p className="text-text-muted">Your account and store details.</p>
      </div>
      <div className="grid gap-6 md:grid-cols-[14rem_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="space-y-4">
          <SettingsGroup heading="Account" links={account} />
          {access?.canViewStoreSettings ? <SettingsGroup heading="Store" links={store} /> : null}
        </nav>
        <div className="max-w-4xl">
          {access?.canViewStoreSettings ? (
            <SettingsContent tab={tab} />
          ) : (
            <p role="status">You do not have settings access in this shop.</p>
          )}
        </div>
      </div>
    </main>
  );
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
