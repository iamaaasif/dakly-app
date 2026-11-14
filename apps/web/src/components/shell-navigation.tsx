'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Users, ShieldCheck, LifeBuoy } from 'lucide-react';
import type { SessionContext } from '@dakly/contracts/sessions';
import { cn } from '@dakly/ui/cn';
import { CollapseNavigation } from './collapse-navigation';

type ShellNavigationProps = {
  session: SessionContext;
  collapsed?: boolean;
  onCollapse?: () => void;
  onNavigate?: () => void;
};
export function ShellNavigation({
  session,
  collapsed,
  onCollapse,
  onNavigate,
}: ShellNavigationProps) {
  const pathname = usePathname();
  const links = [
    {
      href: '/customers',
      label: 'Customers',
      icon: Users,
      visible: session.currentStore?.canViewCustomers,
    },
    {
      href: '/support-access',
      label: 'Support access',
      icon: LifeBuoy,
      visible: session.currentStore?.canApproveSupport,
    },
    { href: '/security', label: 'Security', icon: ShieldCheck, visible: true },
  ];
  return (
    <div className="flex h-full min-w-0 flex-col gap-6 p-3">
      <p className="px-1 py-3 text-lg font-bold">{collapsed ? 'D' : 'Dakly'}</p>
      <nav aria-label="Main navigation" className="space-y-2">
        {links
          .filter((link) => link.visible)
          .map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              title={collapsed ? label : undefined}
              aria-current={pathname === href ? 'page' : undefined}
              className={cn(
                'flex min-h-10 min-w-10 items-center gap-3 rounded-md p-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
                pathname === href
                  ? 'bg-primary-soft font-semibold text-action-hover'
                  : 'hover:bg-surface-muted',
              )}
            >
              <Icon aria-hidden="true" size={20} strokeWidth={1.75} className="shrink-0" />
              <span className={cn(collapsed && 'sr-only')}>{label}</span>
            </Link>
          ))}
      </nav>
      {onCollapse ? <CollapseNavigation collapsed={collapsed} onCollapse={onCollapse} /> : null}
    </div>
  );
}
