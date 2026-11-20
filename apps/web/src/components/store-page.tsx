'use client';
import type { ReactNode } from 'react';

import { useSessionContext } from '@/lib/session-context';

type StorePageProps = {
  permission:
    | 'canViewProducts'
    | 'canViewOrders'
    | 'canViewAnalytics'
    | 'canViewCampaigns'
    | 'canEditCampaigns'
    | 'canViewSocial'
    | 'canEditSocial'
    | 'canViewAutomations'
    | 'canEditAutomations'
    | 'canViewCustomers'
    | 'canCreateCustomer'
    | 'canApproveSupport'
    | 'canViewTeam'
    | 'canViewStoreSettings';
  children: ReactNode;
};
export function StorePage({ permission, children }: StorePageProps) {
  const { data } = useSessionContext();
  if (!data?.currentStore?.[permission])
    return (
      <p role="status" className="p-6">
        You do not have access to this action in the current shop.
      </p>
    );
  return children;
}
