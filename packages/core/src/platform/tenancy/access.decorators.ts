import { SetMetadata } from '@nestjs/common';
import type { AccessLevel, Permission, PermissionArea } from '@dakly/contracts/team';

export const ACCESS_RULE = Symbol('ACCESS_RULE');
export type AccessRule =
  | { kind: 'public' | 'user' | 'member' }
  | { kind: 'permission'; area: PermissionArea; level: Exclude<AccessLevel, 'none'> };

export function RequirePermission(permission: Permission) {
  const [area, level] = permission.split('.') as [PermissionArea, Exclude<AccessLevel, 'none'>];
  return SetMetadata(ACCESS_RULE, { kind: 'permission', area, level } satisfies AccessRule);
}

export const AnyMember = () => SetMetadata(ACCESS_RULE, { kind: 'member' } satisfies AccessRule);
export const RequireUser = () => SetMetadata(ACCESS_RULE, { kind: 'user' } satisfies AccessRule);
export const Public = () => SetMetadata(ACCESS_RULE, { kind: 'public' } satisfies AccessRule);
