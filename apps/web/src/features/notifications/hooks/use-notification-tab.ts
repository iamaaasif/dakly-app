import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import type { NotificationCategory } from '@dakly/contracts/notifications';
import { notificationCategories } from '@dakly/contracts/platform';

export type NotificationTab = 'all' | NotificationCategory;
export const notificationTabs: NotificationTab[] = ['all', ...notificationCategories];

// The open sheet and its tab live in one search parameter, so a link can open both.
export function useNotificationTab() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const value = searchParams.get('notifications');
  const tab = notificationTabs.find((item) => item === value) ?? null;
  function changeTab(next: NotificationTab | null) {
    const query = new URLSearchParams(searchParams);
    if (next) query.set('notifications', next);
    else query.delete('notifications');
    const search = query.toString();
    router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false });
  }
  return [tab, changeTab] as const;
}
