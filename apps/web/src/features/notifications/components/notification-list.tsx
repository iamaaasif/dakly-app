'use client';
import type { NotificationCategory } from '@dakly/contracts/notifications';
import { Button } from '@dakly/ui/button';
import { QueryError } from '@dakly/ui/query-error';
import { Skeleton } from '@dakly/ui/skeleton';

import { useNotifications } from '../api/notifications';
import { NotificationCard } from './notification-card';

export function NotificationList({ category }: { category?: NotificationCategory }) {
  const notifications = useNotifications(category);
  if (notifications.isPending)
    return (
      <div role="status" className="space-y-3">
        <p>Loading notifications…</p>
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  if (notifications.error)
    return (
      <QueryError
        message={notifications.error.message}
        onRetry={() => void notifications.refetch()}
        retryLabel="Retry notifications"
      />
    );
  const items = notifications.data.pages.flatMap((page) => page.items);
  if (!items.length)
    return <p>Nothing here yet. Problems to fix and ideas to sell more will show up here.</p>;
  return (
    <div className="space-y-3">
      <ul className="space-y-3">
        {items.map((notification) => (
          <li key={notification.id}>
            <NotificationCard notification={notification} />
          </li>
        ))}
      </ul>
      {notifications.hasNextPage ? (
        <Button
          variant="secondary"
          loading={notifications.isFetchingNextPage}
          onClick={() => void notifications.fetchNextPage()}
        >
          Show older notifications
        </Button>
      ) : null}
    </div>
  );
}
