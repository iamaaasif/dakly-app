'use client';
import { useContext } from 'react';

import { Sheet } from '@dakly/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@dakly/ui/tabs';

import { type NotificationTab, notificationTabs } from '../hooks/use-notification-tab';
import { NotificationList } from './notification-list';
import { SessionInteraction } from '@/components/session-interaction';

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
  // The sheet renders outside the hidden shell, so it hides itself while the session is checked.
  const isBlocked = useContext(SessionInteraction);
  return (
    <Sheet open={!isBlocked} side="right" title="Notifications" onClose={onClose}>
      {/* Manual, so moving focus with the arrow keys does not load each category on the way. */}
      <Tabs
        value={tab}
        activationMode="manual"
        onValueChange={(value) => onTab(value as NotificationTab)}
      >
        <TabsList aria-label="Notification categories">
          {notificationTabs.map((item) => (
            <TabsTrigger key={item} value={item}>
              {tabLabels[item]}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value={tab}>
          <NotificationList category={tab === 'all' ? undefined : tab} />
        </TabsContent>
      </Tabs>
    </Sheet>
  );
}
