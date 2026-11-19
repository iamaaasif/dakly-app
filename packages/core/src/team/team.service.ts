import { Inject, Injectable } from '@nestjs/common';

import type { UserStorePageQuery, UserStorePage } from '@dakly/contracts/sessions';
import {
  customRolePermissionsSchema,
  type StoreAccess,
  type PermissionArea,
  type AccessLevel,
  type Permission,
} from '@dakly/contracts/team';

import { builtInRoleAccess } from './built-in-roles';
import {
  canAccess,
  canApproveSends,
  canApproveSupport,
  canChangeExtensions,
  canDo,
  hasStoreAdminRole,
} from './permissions';
import { TeamRepository } from './team.repository';

@Injectable()
export class TeamService {
  constructor(@Inject(TeamRepository) private readonly repository: TeamRepository) {}

  canAccess(access: StoreAccess, area: PermissionArea, level: AccessLevel): boolean {
    return canAccess(access, area, level);
  }

  canApproveSupport(access: StoreAccess) {
    return canApproveSupport(access);
  }

  canApproveSends(access: StoreAccess): boolean {
    return canApproveSends(access);
  }

  canTransferOwnership(access: StoreAccess): boolean {
    return canDo(access, 'ownership.transfer');
  }

  canChangeExtensions(access: StoreAccess): boolean {
    return canChangeExtensions(access);
  }

  canManageChannelConnections(access: StoreAccess): boolean {
    return hasStoreAdminRole(access);
  }

  async accessFor(storeId: string, userId: string): Promise<StoreAccess | undefined> {
    const membership = await this.repository.findAccess(storeId, userId);
    return membership && toStoreAccess(membership);
  }

  async userIdsWithPermission(storeId: string, permission: Permission): Promise<string[]> {
    const [area, level] = permission.split('.') as [PermissionArea, AccessLevel];
    const members = await this.repository.findActiveAccess(storeId);
    return members.flatMap((member) => {
      const access = toStoreAccess(member);
      return member.userId && access && canAccess(access, area, level) ? [member.userId] : [];
    });
  }

  lockAndFindOwnedStore(storeId: string, userId: string): Promise<string | undefined> {
    return this.repository.lockAndFindOwnedStore(storeId, userId);
  }

  addOwner(storeId: string, userId: string): Promise<void> {
    return this.repository.addOwner(storeId, userId);
  }

  accountOwnerContacts(userId: string) {
    return this.repository.accountOwnerContacts(userId);
  }

  storeContext(userId: string, storeId?: string) {
    return this.repository.storeContext(userId, storeId);
  }

  async storesFor(
    userId: string,
    query: UserStorePageQuery = { limit: 50 },
  ): Promise<UserStorePage> {
    const rows = await this.repository.storesFor(userId, query);
    const items = rows.slice(0, query.limit);
    return { items, nextCursor: rows.length > query.limit ? items.at(-1)!.storeId : null };
  }
}

function toStoreAccess(
  membership: Awaited<ReturnType<TeamRepository['findActiveAccess']>>[number],
): StoreAccess | undefined {
  if (membership.builtInRole) return structuredClone(builtInRoleAccess[membership.builtInRole]);
  if (!membership.roleId) return undefined;
  // Stored custom JSON crosses the database boundary; invalid grants fail closed.
  const permissions = customRolePermissionsSchema.safeParse({
    areas: membership.areas,
    seeFullPhone: membership.seeFullPhone,
    exportLists: membership.exportLists,
    refund: membership.refund,
  });
  return permissions.success ? { role: 'custom', ...permissions.data } : undefined;
}
