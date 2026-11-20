import type { AccessLevel, PermissionArea } from '@dakly/contracts/team';

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

export type PermissionFlag = keyof typeof flagLabels;

export const flagDescriptions: Record<PermissionFlag, string> = {
  seeFullPhone: 'Otherwise numbers show as 01712-•••903.',
  exportLists: 'Lets them take your customer data out of Dakly.',
  refund: 'Allow issuing refunds for cancelled or returned orders.',
};

export const accessLabels: Record<AccessLevel, string> = {
  none: 'No access',
  view: 'View',
  edit: 'Edit',
};
