'use client';
import {
  BookOpen,
  Bot,
  CalendarDays,
  ChartLine,
  House,
  Layers,
  LogOut,
  MessageSquare,
  Megaphone,
  Package,
  PenLine,
  Plug,
  Puzzle,
  Send,
  Settings,
  Store,
  Truck,
  Users,
  UsersRound,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import Link, { useLinkStatus } from 'next/link';
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
  // Screens under href (a product page under /products) keep this link highlighted.
  nested?: boolean;
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
    related: ['/security', '/team/ownership', '/support-access', '/activity'],
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
            <LogOut
              aria-hidden="true"
              size={collapsed ? 16 : 20}
              strokeWidth={1.75}
              className="shrink-0"
            />
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
  nested,
  collapsed,
  onNavigate,
}: NavigationLink & Pick<ShellNavigationProps, 'collapsed' | 'onNavigate'>) {
  const current = currentState({ href, related, nested }, usePathname(), useSearchParams());
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
        'has-data-[pending=true]:bg-primary-soft has-data-[pending=true]:font-semibold has-data-[pending=true]:text-action-hover',
      )}
    >
      <NavigationLinkContent icon={Icon} label={label} collapsed={collapsed} />
    </Link>
  );
}

// useLinkStatus only works below a Link. The pending flag lets the link highlight on the click,
// before the next screen has arrived.
function NavigationLinkContent({
  icon: Icon,
  label,
  collapsed,
}: { icon: LucideIcon; label: string } & Pick<ShellNavigationProps, 'collapsed'>) {
  const { pending } = useLinkStatus();
  return (
    <>
      <Icon aria-hidden="true" size={collapsed ? 16 : 20} strokeWidth={1.75} className="shrink-0" />
      <span className={cn(collapsed && 'sr-only')} data-pending={pending}>
        {label}
      </span>
    </>
  );
}

// Groups follow the design order.
export function navigationGroups(session: SessionContext): NavigationGroup[] {
  const store = session.currentStore;
  return [
    {
      heading: 'Workspace',
      links: [
        { href: '/dashboard', label: 'Dashboard', icon: House, visible: Boolean(store) },
        { href: '/chats', label: 'Chats', icon: MessageSquare, visible: store?.canViewChats },
      ],
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
        {
          href: '/products',
          label: 'Products',
          icon: Package,
          visible: store?.canViewProducts,
          nested: true,
        },
      ],
    },
    physicalShopGroup(store),
    marketingGroup(store),
    socialGroup(store),
    {
      heading: 'Intelligence',
      links: [
        {
          href: '/analytics',
          label: 'Analytics',
          icon: ChartLine,
          visible: store?.canViewAnalytics,
        },
      ],
    },
    ...settingsGroups(store),
  ];
}

function physicalShopGroup(store: SessionContext['currentStore']): NavigationGroup {
  return {
    heading: 'Physical shop',
    links: [
      { href: '/due-book', label: 'Due book', icon: BookOpen, visible: store?.canViewDueBook },
    ],
  };
}

function marketingGroup(store: SessionContext['currentStore']): NavigationGroup {
  return {
    heading: 'Marketing',
    links: [
      { href: '/campaigns', label: 'Campaigns', icon: Megaphone, visible: store?.canViewCampaigns },
      { href: '/automations', label: 'Automations', icon: Zap, visible: store?.canViewAutomations },
    ],
  };
}

function socialGroup(store: SessionContext['currentStore']): NavigationGroup {
  const visible = store?.canViewSocial;
  return {
    heading: 'Social auto post',
    links: [
      { href: '/social', label: 'Social hub', icon: Send, visible },
      { href: '/social/posts', label: 'My posts', icon: CalendarDays, visible },
      { href: '/content-studio', label: 'AI Content Studio', icon: PenLine, visible },
    ],
  };
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
          href: '/extensions',
          label: 'Extensions',
          icon: Puzzle,
          visible: store?.canViewStoreSettings,
        },
        {
          href: '/integrations',
          label: 'Integrations',
          icon: Plug,
          visible: store?.canViewStoreSettings,
        },
        // The Inbox design has no room for it, so the agent drawer opens from here.
        {
          href: '/chats?agent=settings',
          label: 'AI agent',
          icon: Bot,
          visible: store?.canViewChats,
        },
      ],
    },
  ];
}

function NavigationLogo({ collapsed }: Pick<ShellNavigationProps, 'collapsed'>) {
  return (
    <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-3.5 max-md:pr-16">
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
    // Relative keeps the collapsed rail's screen-reader labels inside this scroll box.
    <div
      className={cn(
        'relative min-h-0 flex-1 overflow-y-auto p-3',
        collapsed ? 'space-y-2' : 'space-y-4',
      )}
    >
      {groups.map((group, index) => (
        <div
          key={group.heading}
          role="group"
          aria-labelledby={`${groupId}-${index}`}
          // The rail has no room for headings, so a rule separates the groups instead.
          className={cn('space-y-1', collapsed && index > 0 && 'border-t border-border pt-2')}
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
  { href, related, nested }: Pick<NavigationLink, 'href' | 'related' | 'nested'>,
  pathname: string,
  search: Pick<URLSearchParams, 'get'>,
) {
  const link = new URL(href, 'http://link.invalid');
  const path = link.pathname;
  const linkParams = [...link.searchParams];
  if (nested && pathname.startsWith(`${path}/`)) return 'page';
  if (pathname !== path) return related?.includes(pathname) ? 'location' : undefined;
  if (linkParams.length) {
    return linkParams.every(([key, value]) => search.get(key) === value) ? 'page' : undefined;
  }
  return related && search.get('tab') ? 'location' : 'page';
}
