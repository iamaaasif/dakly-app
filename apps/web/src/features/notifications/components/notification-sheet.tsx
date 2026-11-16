'use client';
import { cn } from '@dakly/ui/cn';

import { type NotificationTab, notificationTabs } from '../hooks/use-notification-tab';
import { NotificationList } from './notification-list';
import { SessionDialog } from '@/components/session-dialog';

const tabLabels: Record<NotificationTab, string> = {
  all: 'All',
  fix_now: 'Fix now',
  sell_more: 'Ways to sell more',
  activity: 'Activity',
  billing: 'Billing',
  security: 'Security',
};

type NotificationSheetProps = {
  tab: NotificationTab;
  onTab: (tab: NotificationTab) => void;
  onClose: () => void;
};
export function NotificationSheet({ tab, onTab, onClose }: NotificationSheetProps) {
  return (
    <SessionDialog open title="Notifications" onClose={onClose}>
      <nav aria-label="Notification categories" className="mb-4 flex flex-wrap gap-2">
        {notificationTabs.map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={tab === item}
            onClick={() => onTab(item)}
            className={cn(
              'min-h-10 rounded-md px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
              tab === item
                ? 'bg-primary-soft font-semibold text-action-hover'
                : 'hover:bg-surface-muted',
            )}
          >
            {tabLabels[item]}
          </button>
        ))}
      </nav>
      <NotificationList category={tab === 'all' ? undefined : tab} />
    </SessionDialog>
  );
}
