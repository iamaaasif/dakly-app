import type { PermissionArea } from '@dakly/contracts/team';
export const permissionLabels: Record<PermissionArea, string> = {
  dashboard: 'Dashboard',
  chats: 'Chats',
  customers: 'Customers',
  segments: 'Segments',
  orders: 'Orders',
  products: 'Products',
  campaigns: 'Campaigns',
  automations: 'Automations',
  social: 'Social posts',
  analytics: 'Analytics',
  storeSettings: 'Store settings',
  team: 'Team',
  billing: 'Billing',
  shopSales: 'Shop sales',
  dueBook: 'Due book',
};
export const flagLabels = {
  seeFullPhone: 'See full phone numbers',
  exportLists: 'Download customer lists',
  refund: 'Refund payments',
} as const;
