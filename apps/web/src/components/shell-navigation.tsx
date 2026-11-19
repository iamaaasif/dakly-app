'use client';
import {
  House,
  Layers,
  LogOut,
  Megaphone,
  Package,
  Puzzle,
  Settings,
  Store,
  Truck,
  Users,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useId } from 'react';

import type { SessionContext } from '@dakly/contracts/sessions';
import { cn } from '@dakly/ui/cn';

import { CollapseNavigation } from './collapse-navigation';

type NavigationLink = {
  href: string;
  label: string;
  icon: LucideIcon;
  visible?: boolean;
  related?: string[];
};
type NavigationGroup = { heading: string; links: NavigationLink[] };

type ShellNavigationProps = {
  session: SessionContext;
  onSignOut: () => Promise<void>;
  collapsed?: boolean;
  onCollapse?: () => void;
  onNavigate?: () => void;
};
export function ShellNavigation({
  session,
  onSignOut,
  collapsed,
  onCollapse,
  onNavigate,
}: ShellNavigationProps) {
  const groups = navigationGroups(session)
    .map((group) => ({ ...group, links: group.links.filter((link) => link.visible) }))
    .filter((group) => group.links.length > 0);
  const settings = {
    href: '/settings',
    label: 'Settings',
    icon: Settings,
    related: ['/security', '/team/ownership', '/support-access'],
  };
  const linkProps = { collapsed, onNavigate };
  return (
    <div className="flex h-full min-w-0 flex-col">
      <NavigationLogo collapsed={collapsed} />
      <nav aria-label="Main navigation" className="flex min-h-0 flex-1 flex-col">
        <NavigationGroups groups={groups} {...linkProps} />
        <div className="shrink-0 space-y-1 border-t border-border p-3">
          {session.currentStore ? <NavigationItem {...settings} {...linkProps} /> : null}
          <button
            type="button"
            onClick={() => void onSignOut()}
            title={collapsed ? 'Log out' : undefined}
            className="flex min-h-10 w-full min-w-10 items-center gap-3 rounded-md p-2 font-medium text-danger hover:bg-danger-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            <LogOut aria-hidden="true" size={20} strokeWidth={1.75} className="shrink-0" />
            <span className={cn(collapsed && 'sr-only')}>Log out</span>
          </button>
          {onCollapse ? <CollapseNavigation collapsed={collapsed} onCollapse={onCollapse} /> : null}
        </div>
      </nav>
    </div>
  );
}

function NavigationItem({
  href,
  label,
  icon: Icon,
  related,
  collapsed,
  onNavigate,
}: NavigationLink & Pick<ShellNavigationProps, 'collapsed' | 'onNavigate'>) {
  const current = currentState({ href, related }, usePathname(), useSearchParams().get('tab'));
  return (
    <Link
      href={href}
      onClick={onNavigate}
      title={collapsed ? label : undefined}
      aria-current={current}
      className={cn(
        'flex min-h-10 min-w-10 items-center gap-3 rounded-md p-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
        current === 'page' && 'bg-primary-soft font-semibold text-action-hover',
        current === 'location' && 'font-semibold text-action-hover hover:bg-surface-muted',
        !current && 'hover:bg-surface-muted',
      )}
    >
      <Icon aria-hidden="true" size={20} strokeWidth={1.75} className="shrink-0" />
      <span className={cn(collapsed && 'sr-only')}>{label}</span>
    </Link>
  );
}

// Groups follow the design order. Social auto post joins when their screens exist.
export function navigationGroups(session: SessionContext): NavigationGroup[] {
  const store = session.currentStore;
  return [
    {
      heading: 'Workspace',
      links: [{ href: '/dashboard', label: 'Dashboard', icon: House, visible: Boolean(store) }],
    },
    {
      heading: 'Customers',
      links: [
        {
          href: '/customers',
          label: 'All customers',
          icon: Users,
          visible: store?.canViewCustomers,
        },
        { href: '/segments', label: 'Segments', icon: Layers, visible: store?.canViewSegments },
      ],
    },
    {
      heading: 'Sales',
      links: [
        { href: '/orders', label: 'Orders', icon: Truck, visible: store?.canViewOrders },
        { href: '/products', label: 'Products', icon: Package, visible: store?.canViewProducts },
      ],
    },
    {
      heading: 'Marketing',
      links: [
        {
          href: '/campaigns',
          label: 'Campaigns',
          icon: Megaphone,
          visible: store?.canViewCampaigns,
        },
      ],
    },
    ...settingsGroups(store),
  ];
}

function settingsGroups(store: SessionContext['currentStore']): NavigationGroup[] {
  return [
    {
      heading: 'Store information',
      links: [
        {
          href: '/settings?tab=store',
          label: 'Store settings',
          icon: Store,
          visible: store?.canViewStoreSettings,
        },
        {
          href: '/team',
          label: 'Team and permissions',
          icon: UsersRound,
          visible: store?.canViewTeam,
        },
      ],
    },
    {
      heading: 'Configuration',
      links: [
        {
          href: '/settings?tab=extensions',
          label: 'Extensions',
          icon: Puzzle,
          visible: store?.canViewStoreSettings,
        },
      ],
    },
  ];
}

function NavigationLogo({ collapsed }: Pick<ShellNavigationProps, 'collapsed'>) {
  return (
    <div className="flex h-16 shrink-0 items-center gap-3 border-b border-border px-4 max-md:pr-16">
      <span
        aria-hidden="true"
        className="grid size-9 shrink-0 place-items-center rounded-md bg-primary text-md font-bold text-on-primary"
      >
        D
      </span>
      <div className={cn('min-w-0', collapsed && 'sr-only')}>
        <p className="text-md leading-5 font-bold">
          Dakly <span className="text-primary">AI</span>
        </p>
        <p className="truncate text-xs text-text-muted">Call customers. Grow sales.</p>
      </div>
    </div>
  );
}

function NavigationGroups({
  groups,
  collapsed,
  onNavigate,
}: { groups: NavigationGroup[] } & Pick<ShellNavigationProps, 'collapsed' | 'onNavigate'>) {
  const groupId = useId();
  return (
    <div className="flex-1 space-y-4 overflow-y-auto p-3">
      {groups.map((group, index) => (
        <div
          key={group.heading}
          role="group"
          aria-labelledby={`${groupId}-${index}`}
          className="space-y-1"
        >
          <p
            id={`${groupId}-${index}`}
            className={cn(
              'px-2 pt-2 text-xs font-semibold tracking-wide text-text-muted uppercase',
              collapsed && 'sr-only',
            )}
          >
            {group.heading}
          </p>
          {group.links.map((link) => (
            <NavigationItem
              key={link.href}
              {...link}
              collapsed={collapsed}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// A link with a tab is the page only on that tab. A link that owns several screens (Settings)
// is the page on its own path without a tab, and the location on the screens it leads to.
export function currentState(
  { href, related }: Pick<NavigationLink, 'href' | 'related'>,
  pathname: string,
  tab: string | null,
) {
  const [path, query] = href.split('?');
  const linkTab = new URLSearchParams(query).get('tab');
  if (pathname !== path) return related?.includes(pathname) ? 'location' : undefined;
  if (linkTab) return tab === linkTab ? 'page' : undefined;
  return related && tab ? 'location' : 'page';
}
