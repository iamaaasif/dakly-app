import { Inject, Injectable } from '@nestjs/common';
import { customRolePermissionsSchema, type StoreAccess } from '@dakly/contracts/team';
import { TeamRepository } from './team.repository';
import { builtInRoleAccess } from './built-in-roles';
import { canChangeExtensions } from './permissions';

@Injectable()
export class TeamService {
  constructor(@Inject(TeamRepository) private readonly repository: TeamRepository) {}

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

  storesFor(userId: string) {
    return this.repository.storesFor(userId);
  }
}
