'use client';
import { usePathname } from 'next/navigation';
import { type ReactNode, useState } from 'react';

import type { SessionContext } from '@dakly/contracts/sessions';
import { cn } from '@dakly/ui/cn';

import { AccountMenu } from './account-menu';
import { MobileNavigation } from './mobile-navigation';
import { ShellNavigation } from './shell-navigation';
import { StoreRequired } from './store-required';
import { StoreSwitcher } from './store-switcher';

type ShellFrameProps = {
  data: SessionContext;
  blocked: boolean;
  generation: number;
  onSwitch: (id: string) => Promise<void>;
  onSignOut: () => Promise<void>;
  actions: ReactNode;
  children: ReactNode;
};
export function ShellFrame({
  data,
  blocked,
  generation,
  onSwitch,
  onSignOut,
  actions,
  children,
}: ShellFrameProps) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const inbox = pathname === '/chats';
  const needsStore = !data.currentStore && pathname !== '/security' && pathname !== '/setup';
  return (
    <div className="flex min-h-dvh">
      <a
        href="#page-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-surface focus:p-4"
      >
        Skip to content
      </a>
      <aside
        className={cn(
          'sticky top-0 hidden h-dvh shrink-0 border-r border-border bg-surface md:block',
          collapsed ? ['w-16', inbox && 'w-16.5'] : 'w-62',
        )}
      >
        <ShellNavigation
          session={data}
          onSignOut={onSignOut}
          collapsed={collapsed}
          onCollapse={() => setCollapsed(!collapsed)}
        />
      </aside>
      <div className={cn('min-w-0 flex-1', inbox && 'flex h-dvh flex-col max-md:min-h-[36rem]')}>
        <header
          className={cn(
            'flex min-h-16 shrink-0 flex-wrap items-center gap-2 border-b border-border bg-surface px-4 py-2 md:gap-3 md:px-8',
            inbox && 'md:min-h-inbox-thread-header md:px-5',
          )}
        >
          <MobileNavigation session={data} blocked={blocked} onSignOut={onSignOut} />
          <StoreSwitcher session={data} onSwitch={onSwitch} compact={inbox} />
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {actions}
            <AccountMenu user={data.user} onSignOut={onSignOut} />
          </div>
        </header>
        <div
          id="page-content"
          tabIndex={-1}
          className={inbox ? 'flex min-h-0 flex-1 flex-col' : 'mx-auto max-w-7xl'}
          key={`${data.contextTag}:${generation}`}
        >
          {needsStore ? <StoreRequired hasMemberships={data.hasMemberships} /> : children}
        </div>
      </div>
    </div>
  );
}
