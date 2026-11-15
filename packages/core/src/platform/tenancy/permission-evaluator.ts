import type { AccessLevel, PermissionArea, StoreAccess } from '@dakly/contracts/team';

export const PERMISSION_EVALUATOR = Symbol('PERMISSION_EVALUATOR');
export type PermissionEvaluator = {
  canAccess: (access: StoreAccess, area: PermissionArea, level: AccessLevel) => boolean;
  hasKnownRole: (access: StoreAccess) => boolean;
};
