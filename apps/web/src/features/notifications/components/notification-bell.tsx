'use client';
import { Bell } from 'lucide-react';

import { Button } from '@dakly/ui/button';

import { useUnreadNotifications } from '../api/unread-notifications';
import { useEventStream } from '../hooks/use-event-stream';
import { useNotificationTab } from '../hooks/use-notification-tab';
import { NotificationSheet } from './notification-sheet';
import { useSessionContext } from '@/lib/session-context';

export function NotificationBell() {
  const { data } = useSessionContext();
  return data?.currentStore ? <StoreNotificationBell /> : null;
}

function StoreNotificationBell() {
  useEventStream();
  const unread = useUnreadNotifications();
  const [tab, changeTab] = useNotificationTab();
  const count = unread.data
    ? `${unread.data.items.length}${unread.data.nextCursor ? '+' : ''}`
    : null;
  const label = count ? `Open notifications, ${count} unread` : 'Open notifications';
  return (
    <>
      <Button
        variant="secondary"
        className="shrink-0 px-2"
        aria-label={label}
        onClick={() => changeTab('all')}
      >
        <Bell aria-hidden="true" size={20} />
        {count && count !== '0' ? (
          <span
            aria-hidden="true"
            className="rounded-full bg-danger px-2 text-xs font-semibold text-on-primary tabular-nums"
          >
            {count}
          </span>
        ) : null}
      </Button>
      {tab ? (
        <NotificationSheet tab={tab} onTab={changeTab} onClose={() => changeTab(null)} />
      ) : null}
    </>
  );
}
