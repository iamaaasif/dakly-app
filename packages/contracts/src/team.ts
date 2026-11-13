import { z } from 'zod';
import type { builtInRoles } from './stores';

export const permissionAreas = [
  'dashboard',
  'chats',
  'customers',
  'segments',
  'orders',
  'products',
  'campaigns',
  'automations',
  'social',
  'analytics',
  'storeSettings',
  'team',
  'billing',
  'shopSales',
  'dueBook',
] as const;
export const accessLevels = ['none', 'view', 'edit'] as const;
export type PermissionArea = (typeof permissionAreas)[number];
export type AccessLevel = (typeof accessLevels)[number];
export type BuiltInRole = (typeof builtInRoles)[number];
export type Permission = `${PermissionArea}.${Exclude<AccessLevel, 'none'>}`;
export type OwnerAction = 'billing.edit' | 'store.close' | 'ownership.transfer';

export const customRolePermissionsSchema = z
  .strictObject({
    areas: z.partialRecord(z.enum(permissionAreas), z.enum(accessLevels)),
    seeFullPhone: z.boolean(),
    exportLists: z.boolean(),
    refund: z.boolean(),
  })
  .refine((permissions) => permissions.areas.billing !== 'edit', {
    path: ['areas', 'billing'],
    message: 'Custom roles can only view billing',
  });
export type RolePermissions = z.infer<typeof customRolePermissionsSchema>;
export type StoreAccess = RolePermissions & { role: BuiltInRole | 'custom' };
