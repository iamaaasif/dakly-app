'use client';
import { usePathname } from 'next/navigation';
import { type ReactNode, useState } from 'react';

import type { SessionContext } from '@dakly/contracts/sessions';
import { cn } from '@dakly/ui/cn';

import { AccountMenu } from './account-menu';
import { MobileNavigation } from './mobile-navigation';
import { ShellNavigation } from './shell-navigation';
import { ShellNavigationCollapse } from './shell-navigation-collapse';
import { StoreRequired } from './store-required';

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
  const needsStore = !data.currentStore && pathname !== '/security' && pathname !== '/setup';
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#page-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-surface focus:p-4"
      >
        Skip to content
      </a>
      <ShellHeader {...{ data, blocked, actions, onSwitch, onSignOut }} />
      <div className="flex min-h-0 flex-1">
        <aside
          className={cn(
            'sticky top-0 hidden h-dvh shrink-0 border-r border-border bg-surface md:block',
            collapsed ? 'w-16' : 'w-62',
          )}
        >
          <ShellNavigation
            session={data}
            onSwitch={onSwitch}
            onSignOut={onSignOut}
            collapsed={collapsed}
            onCollapse={() => setCollapsed(!collapsed)}
          />
        </aside>
        <div
          id="page-content"
          tabIndex={-1}
          className="mx-auto max-w-7xl min-w-0 flex-1 has-[[data-full-width]]:max-w-none"
          key={`${data.contextTag}:${generation}`}
        >
          <ShellNavigationCollapse value={setCollapsed}>
            {needsStore ? <StoreRequired hasMemberships={data.hasMemberships} /> : children}
          </ShellNavigationCollapse>
        </div>
      </div>
    </div>
  );
}

type ShellHeaderProps = Pick<
  ShellFrameProps,
  'data' | 'blocked' | 'actions' | 'onSwitch' | 'onSignOut'
>;
function ShellHeader({ data, blocked, actions, onSwitch, onSignOut }: ShellHeaderProps) {
  return (
    <header className="relative z-30 flex h-[3.5625rem] shrink-0 items-center gap-2 border-b border-border bg-surface px-3 md:gap-3 md:px-3.5">
      <MobileNavigation
        session={data}
        blocked={blocked}
        onSwitch={onSwitch}
        onSignOut={onSignOut}
      />
      <ShellLogo />
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {actions}
        <AccountMenu user={data.user} onSignOut={onSignOut} />
      </div>
    </header>
  );
}

function ShellLogo() {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span
        aria-hidden="true"
        className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary text-md font-bold text-on-primary"
      >
        D
      </span>
      <div className="min-w-0 max-sm:hidden">
        <p className="text-md leading-5 font-bold">
          Dakly <span className="text-primary">AI</span>
        </p>
        <p className="truncate text-xs text-text-muted">Call customers. Grow sales.</p>
      </div>
    </div>
  );
}
