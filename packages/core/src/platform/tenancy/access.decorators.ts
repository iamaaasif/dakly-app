import { SetMetadata } from '@nestjs/common';

import type { StaffIdentity } from '@dakly/contracts/staff-auth';
import type { AccessLevel, Permission, PermissionArea } from '@dakly/contracts/team';

export const ACCESS_RULE = Symbol('ACCESS_RULE');
export type AccessRule =
  | { kind: 'staff'; authenticated: boolean; roles: StaffIdentity['role'][] }
  | { kind: 'public' | 'user' | 'member' | 'support' | 'support-handoff' }
  | { kind: 'permission'; area: PermissionArea; level: Exclude<AccessLevel, 'none'> };

export function RequirePermission(permission: Permission) {
  const [area, level] = permission.split('.') as [PermissionArea, Exclude<AccessLevel, 'none'>];
  return SetMetadata(ACCESS_RULE, { kind: 'permission', area, level } satisfies AccessRule);
}

export const AnyMember = () => SetMetadata(ACCESS_RULE, { kind: 'member' } satisfies AccessRule);
export const RequireUser = () => SetMetadata(ACCESS_RULE, { kind: 'user' } satisfies AccessRule);
export const Public = () => SetMetadata(ACCESS_RULE, { kind: 'public' } satisfies AccessRule);

export const PROVIDER_CALLBACK = Symbol('PROVIDER_CALLBACK');
export const ProviderCallback = () => SetMetadata(PROVIDER_CALLBACK, true);

// Only the SMS opt-out post comes from a page on the short link domain.
export const SHORT_LINK_ORIGIN = Symbol('SHORT_LINK_ORIGIN');
export const AllowShortLinkOrigin = () => SetMetadata(SHORT_LINK_ORIGIN, true);

export const StaffAccess = (authenticated = true, roles: StaffIdentity['role'][] = []) =>
  SetMetadata(ACCESS_RULE, { kind: 'staff', authenticated, roles } satisfies AccessRule);

export const SupportAccess = () =>
  SetMetadata(ACCESS_RULE, { kind: 'support' } satisfies AccessRule);
export const SupportHandoff = () =>
  SetMetadata(ACCESS_RULE, { kind: 'support-handoff' } satisfies AccessRule);
