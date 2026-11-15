import type { UserStorePageQuery, UserStorePage } from '@dakly/contracts/sessions';
import { Inject, Injectable } from '@nestjs/common';
import {
  customRolePermissionsSchema,
  type StoreAccess,
  type PermissionArea,
  type AccessLevel,
} from '@dakly/contracts/team';
import { TeamRepository } from './team.repository';
import { builtInRoleAccess } from './built-in-roles';
import { canAccess, canApproveSupport, canChangeExtensions, canDo } from './permissions';

@Injectable()
export class TeamService {
  constructor(@Inject(TeamRepository) private readonly repository: TeamRepository) {}

  canAccess(access: StoreAccess, area: PermissionArea, level: AccessLevel): boolean {
    return canAccess(access, area, level);
  }

  canApproveSupport(access: StoreAccess) {
    return canApproveSupport(access);
  }

  canTransferOwnership(access: StoreAccess): boolean {
    return canDo(access, 'ownership.transfer');
  }

  canChangeExtensions(access: StoreAccess): boolean {
    return canChangeExtensions(access);
  }

  async accessFor(storeId: string, userId: string): Promise<StoreAccess | undefined> {
    const membership = await this.repository.findAccess(storeId, userId);
    if (!membership) return undefined;
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
