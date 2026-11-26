'use client';

import type { ComponentProps } from 'react';

import { useConversationCounts } from '@/features/chats/api/conversations';
import { Dashboard } from '@/features/dashboard/components/dashboard';
import { useOrders } from '@/features/orders/api/orders';
import { useSessionContext } from '@/lib/session-context';

export function DashboardScreen(props: Omit<ComponentProps<typeof Dashboard>, 'activity'>) {
  const { data: session } = useSessionContext();
  const chats = useConversationCounts(Boolean(session?.currentStore?.canViewChats));
  const orders = useOrders({ limit: 1 });
  return (
    <Dashboard
      {...props}
      activity={{
        chatsWaiting: chats.data?.needsYou,
        ordersToConfirm: orders.data?.counts?.to_confirm,
        ordersToPack: orders.data?.counts?.to_pack,
      }}
    />
  );
}
