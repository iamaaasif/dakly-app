'use client';
import { usePathname } from 'next/navigation';
import { type ReactNode, useState } from 'react';

import type { SessionContext } from '@dakly/contracts/sessions';
import { Button } from '@dakly/ui/button';
import { cn } from '@dakly/ui/cn';

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
  children: ReactNode;
};
export function ShellFrame({
  data,
  blocked,
  generation,
  onSwitch,
  onSignOut,
  children,
}: ShellFrameProps) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
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
          collapsed ? 'w-16' : 'w-62',
        )}
      >
        <ShellNavigation
          session={data}
          collapsed={collapsed}
          onCollapse={() => setCollapsed(!collapsed)}
        />
      </aside>
      <div className="min-w-0 flex-1">
        <header className="flex flex-wrap items-center gap-4 border-b border-border bg-surface px-4 py-4 md:px-8">
          <MobileNavigation session={data} blocked={blocked} />
          <StoreSwitcher session={data} onSwitch={onSwitch} />
          <p className="min-w-0 text-sm break-words text-text-muted md:ml-auto">{data.user.name}</p>
          <Button variant="secondary" onClick={() => void onSignOut()}>
            Sign out
          </Button>
        </header>
        <div
          id="page-content"
          tabIndex={-1}
          className="mx-auto max-w-7xl"
          key={`${data.contextTag}:${generation}`}
        >
          {needsStore ? <StoreRequired hasMemberships={data.hasMemberships} /> : children}
        </div>
      </div>
    </div>
  );
}
