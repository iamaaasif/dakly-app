import { z } from 'zod';
import { builtInRoles, type membershipStatuses } from './stores';
import { bdMobileSchema } from './phone';

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

const roleFields = { builtInRole: z.enum(builtInRoles).optional(), roleId: z.uuid().optional() };
const oneRole = (value: { builtInRole?: string; roleId?: string }) =>
  Boolean(value.builtInRole) !== Boolean(value.roleId);
export const memberRoleSchema = z.strictObject(roleFields).refine(oneRole, 'Choose one role');
export const inviteMemberSchema = z
  .strictObject({
    ...roleFields,
    phone: bdMobileSchema.optional(),
    email: z.string().trim().toLowerCase().pipe(z.email()).optional(),
  })
  .refine(oneRole, 'Choose one role')
  .refine((value) => Boolean(value.phone) !== Boolean(value.email), 'Choose one recipient');
export const acceptInviteSchema = z.strictObject({ token: z.string().regex(/^[a-f0-9]{64}$/) });
export const memberListQuerySchema = z.strictObject({
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type MemberRoleInput = z.infer<typeof memberRoleSchema>;
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
export type MemberListQuery = z.infer<typeof memberListQuerySchema>;
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;
export type AcceptInviteResponse = { storeId: string; membershipId: string };
export type MemberResponse = {
  id: string;
  userId: string | null;
  name: string | null;
  phone: string | null;
  email: string | null;
  builtInRole: BuiltInRole | null;
  roleId: string | null;
  status: (typeof membershipStatuses)[number];
  inviteExpiresAt: string | null;
  lastActiveAt: string | null;
};
export type MemberListResponse = {
  items: MemberResponse[];
  nextCursor: string | null;
  seats: { used: number; limit: number };
};

const roleNameSchema = z.string().trim().min(1).max(60);
export const createRoleSchema = z.strictObject({
  name: roleNameSchema,
  permissions: customRolePermissionsSchema,
});
export const changeRoleSchema = createRoleSchema
  .partial()
  .refine(
    (input) => input.name !== undefined || input.permissions !== undefined,
    'Provide a name or permissions',
  );
export const roleListQuerySchema = z.strictObject(memberListQuerySchema.shape);
export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type ChangeRoleInput = z.infer<typeof changeRoleSchema>;
export type RoleListQuery = z.infer<typeof roleListQuerySchema>;
export type RoleResponse = { id: string; name: string; permissions: RolePermissions };
export type RoleListResponse = {
  items: RoleResponse[];
  nextCursor: string | null;
  builtInRoles: { builtInRole: BuiltInRole; permissions: RolePermissions }[];
};

export const ownershipTransferCodeSchema = z.strictObject({ membershipId: z.uuid() });
export const startOwnershipTransferSchema = ownershipTransferCodeSchema.extend({
  code: z.string().regex(/^\d{6}$/),
});
export const acceptOwnershipTransferSchema = z.strictObject({ transferId: z.uuid() });
export type OwnershipTransferCodeInput = z.infer<typeof ownershipTransferCodeSchema>;
export type StartOwnershipTransferInput = z.infer<typeof startOwnershipTransferSchema>;
export type AcceptOwnershipTransferInput = z.infer<typeof acceptOwnershipTransferSchema>;
export type OwnershipTransferResponse = {
  id: string;
  ownerUserId: string;
  newOwnerUserId: string;
  expiresAt: string;
  status: 'pending' | 'accepted' | 'cancelled' | 'expired';
};
export type CurrentOwnershipTransferResponse = { transfer: OwnershipTransferResponse | null };
