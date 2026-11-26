import { Check, Megaphone, MessageSquare, ShoppingBag, Sparkles, Truck, Users } from 'lucide-react';
import Link from 'next/link';

import type { SessionContext } from '@dakly/contracts/sessions';
import { cn } from '@dakly/ui/cn';

import type { DashboardActivity } from './dashboard-overview';
import { pluralize } from '@/lib/pluralize';

type Store = NonNullable<SessionContext['currentStore']>;
export type DashboardSupportLink = { phone: string; url: string };
type ActionsProps = {
  activity: DashboardActivity;
  store: Store;
  stoppedBuying?: number;
  support: DashboardSupportLink;
};

const panel = 'rounded-lg border border-border bg-surface shadow-xs';
const actionLink =
  'inline-flex min-h-10 shrink-0 items-center justify-center rounded-control px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus';

function dashboardTaskList({ activity, store, stoppedBuying = 0 }: ActionsProps) {
  const { chatsWaiting, ordersToConfirm, ordersToPack } = activity;
  return [
    store.canEditChats && chatsWaiting
      ? {
          title: `Reply to ${pluralize(chatsWaiting, 'customer')}`,
          description: 'Waiting in Chats',
          label: 'Open chats',
          href: '/chats',
          icon: MessageSquare,
          color: 'bg-primary-soft text-action',
        }
      : null,
    store.canEditOrders && ordersToConfirm
      ? {
          title: `Confirm ${pluralize(ordersToConfirm, 'order')}`,
          description: 'Orders waiting for confirmation',
          label: 'Review',
          href: '/orders?stage=to_confirm',
          icon: Truck,
          color: 'bg-info-soft text-info',
        }
      : null,
    store.canEditOrders && ordersToPack
      ? {
          title: `Pack ${pluralize(ordersToPack, 'order')}`,
          description: 'Confirmed and ready to pack',
          label: 'View',
          href: '/orders?stage=to_pack',
          icon: ShoppingBag,
          color: 'bg-success-soft text-success',
        }
      : null,
    store.canEditCampaigns && stoppedBuying > 0
      ? {
          title: `Win back ${pluralize(stoppedBuying, 'customer')}`,
          description: 'Choose an audience for your offer',
          label: 'Draft offer',
          href: '/campaigns/new',
          icon: Sparkles,
          color: 'bg-surface-muted text-text',
        }
      : null,
  ].filter((task) => task !== null);
}

function DashboardTasks(props: ActionsProps) {
  const tasks = dashboardTaskList(props);
  const {
    store,
    stoppedBuying,
    activity: { chatsWaiting, ordersToConfirm, ordersToPack },
  } = props;
  const hasCounts =
    (!store.canEditChats || chatsWaiting !== undefined) &&
    (!store.canEditOrders || (ordersToConfirm !== undefined && ordersToPack !== undefined)) &&
    (!store.canEditCampaigns || !store.canViewCustomers || stoppedBuying !== undefined);

  return (
    <section aria-labelledby="dashboard-tasks" className={cn(panel, '@container/dashboard-tasks')}>
      <div className="flex items-center justify-between gap-2 px-4 pt-5 pb-3 sm:px-5.5">
        <div>
          <h2 id="dashboard-tasks" className="text-md font-bold tracking-tight">
            Your to-do list
          </h2>
          <p className="text-sm text-text-muted">Orders and customers that need your attention.</p>
        </div>
        <span className="shrink-0 rounded-full bg-surface-muted px-2.5 py-1 text-xs font-semibold">
          {tasks.length} to do
        </span>
      </div>
      {tasks.length ? (
        <ul>
          {tasks.map(({ title, description, label, href, icon: Icon, color }) => (
            <li
              key={href}
              className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3.5 gap-y-2 border-t border-border px-4 py-4 sm:px-5.5 @min-[400px]/dashboard-tasks:grid-cols-[auto_minmax(0,1fr)_auto]"
            >
              <span className={cn('grid size-11 shrink-0 place-items-center rounded-lg', color)}>
                <Icon size={20} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-field font-semibold">{title}</p>
                <p className="text-sm text-text-muted">{description}</p>
              </div>
              <Link
                href={href}
                className={cn(
                  actionLink,
                  'col-start-2 justify-self-start bg-inverse text-on-primary hover:bg-inverse/85 @min-[400px]/dashboard-tasks:col-start-auto',
                )}
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyTasks hasCounts={hasCounts} />
      )}
    </section>
  );
}

function EmptyTasks({ hasCounts }: { hasCounts: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2 border-t border-border px-5 py-8 text-center">
      <span className="grid size-11 place-items-center rounded-lg bg-success-soft text-success">
        <Check size={20} aria-hidden="true" />
      </span>
      <p className="text-field font-semibold">{hasCounts ? 'All caught up' : 'No tasks to show'}</p>
      {hasCounts && <p className="text-sm text-text-muted">Nothing needs you right now.</p>}
    </div>
  );
}

function QuickActions({ store }: { store: Store }) {
  const actions = [
    {
      enabled: store.canCreateCustomer,
      title: 'Add customers',
      href: '/customers',
      icon: Users,
      color: 'bg-surface-muted text-text',
    },
    {
      enabled: store.canEditCampaigns,
      title: 'Create campaign',
      href: '/campaigns/new',
      icon: Megaphone,
      color: 'bg-primary-soft text-action',
    },
    {
      enabled: store.canEditSocial,
      title: 'AI auto social post',
      href: '/social/posts/new',
      icon: Sparkles,
      color: 'bg-ai-soft text-ai',
    },
    {
      enabled: store.canViewOrders,
      title: 'Order management',
      href: '/orders',
      icon: Truck,
      color: 'bg-success-soft text-success',
    },
  ].filter(({ enabled }) => enabled);
  if (!actions.length) return null;

  return (
    <section
      aria-labelledby="dashboard-actions"
      className={cn(panel, 'space-y-3.5 px-4 py-5 sm:px-5.5')}
    >
      <h2 id="dashboard-actions" className="text-md font-bold tracking-tight">
        Quick actions
      </h2>
      <div className="grid grid-cols-2 gap-2.5">
        {actions.map(({ title, href, icon: Icon, color }) => (
          <Link
            key={href}
            href={href}
            className="flex min-w-0 flex-col gap-3 rounded-lg border border-border p-3.5 text-sm leading-snug font-semibold hover:border-border-strong hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            <span className={cn('grid size-9.5 place-items-center rounded-control', color)}>
              <Icon size={18} aria-hidden="true" />
            </span>
            {title}
          </Link>
        ))}
      </div>
    </section>
  );
}

function DashboardSupport({ support }: { support: DashboardSupportLink }) {
  return (
    <div className="flex flex-wrap items-center gap-3.5 rounded-lg bg-surface-muted px-4.5 py-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-surface text-success">
        <MessageSquare size={18} aria-hidden="true" />
      </span>
      <div className="min-w-32 flex-1">
        <p className="font-semibold">Need a hand?</p>
        <p className="text-xs text-text-muted">WhatsApp us at {support.phone}</p>
      </div>
      <a
        href={support.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Chat with Dakly support on WhatsApp"
        className={cn(actionLink, 'border border-border bg-surface text-text hover:bg-background')}
      >
        Chat
      </a>
    </div>
  );
}

export function DashboardActions(props: ActionsProps) {
  return (
    <div className="grid min-w-0 items-start gap-6 @min-[920px]/dashboard:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <DashboardTasks {...props} />
      <div className="grid min-w-0 gap-6">
        <QuickActions store={props.store} />
        <DashboardSupport support={props.support} />
      </div>
    </div>
  );
}
