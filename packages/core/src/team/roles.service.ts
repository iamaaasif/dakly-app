import { Inject, Injectable } from '@nestjs/common';

import { builtInRoles } from '@dakly/contracts/stores';
import {
  customRolePermissionsSchema,
  type ChangeRoleInput,
  type CreateRoleInput,
  type RoleListQuery,
  type RoleListResponse,
  type RoleResponse,
  type StoreAccess,
} from '@dakly/contracts/team';

import { AuditService } from '../audit/audit.service';
import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { builtInRoleAccess } from './built-in-roles';
import { canAccess, canGrantRole } from './permissions';
import { RolesRepository, type Role } from './roles.repository';
import { teamError } from './team.errors';

type Actor = { userId: string; access: StoreAccess };
@Injectable()
export class RolesService {
  constructor(
    @Inject(RolesRepository) private readonly repository: RolesRepository,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async list(storeId: string, query: RoleListQuery): Promise<RoleListResponse> {
    const rows = await this.transaction.run(storeId, async () =>
      query.cursor && !(await this.repository.find(storeId, query.cursor))
        ? []
        : this.repository.list(storeId, query),
    );
    const items = rows.slice(0, query.limit).map((role) => this.response(role));
    return {
      items,
      nextCursor: rows.length > query.limit ? items.at(-1)!.id : null,
      builtInRoles: builtInRoles.map((builtInRole) => {
        const { areas, seeFullPhone, exportLists, refund } = builtInRoleAccess[builtInRole];
        return { builtInRole, permissions: { areas, seeFullPhone, exportLists, refund } };
      }),
    };
  }

  create(storeId: string, input: CreateRoleInput, actor: Actor): Promise<RoleResponse> {
    return this.transaction.runLocked(storeId, async () => {
      this.assertGrant(actor, input);
      await this.assertName(storeId, input.name);
      const role = await this.repository.insert(storeId, input);
      await this.record(storeId, role.id, actor.userId, 'role.created');
      return this.response(role);
    });
  }

  change(
    storeId: string,
    roleId: string,
    input: ChangeRoleInput,
    actor: Actor,
  ): Promise<RoleResponse> {
    return this.transaction.runLocked(storeId, async () => {
      const current = this.response(await this.find(storeId, roleId));
      const proposed = {
        name: input.name ?? current.name,
        permissions: input.permissions ?? current.permissions,
      };
      this.assertGrant(actor, proposed);
      await this.assertName(storeId, proposed.name, roleId);
      const role = await this.repository.change(storeId, roleId, proposed, this.clock.now());
      if (!role) throw teamError('ROLE_NOT_FOUND');
      await this.record(storeId, roleId, actor.userId, 'role.changed');
      return this.response(role);
    });
  }

  remove(storeId: string, roleId: string, actor: Actor): Promise<void> {
    return this.transaction.runLocked(storeId, async () => {
      if (!canAccess(actor.access, 'team', 'edit')) throw teamError('TEAM_ROLE_DENIED');
      await this.find(storeId, roleId);
      if (await this.repository.isReferenced(storeId, roleId)) throw teamError('ROLE_IN_USE');
      await this.repository.remove(storeId, roleId);
      await this.record(storeId, roleId, actor.userId, 'role.deleted');
    });
  }

  private assertGrant(actor: Actor, input: CreateRoleInput): void {
    if (
      !canAccess(actor.access, 'team', 'edit') ||
      !canGrantRole(actor.access, { role: 'custom', ...input.permissions })
    )
      throw teamError('TEAM_ROLE_DENIED');
  }

  private async assertName(storeId: string, name: string, roleId?: string): Promise<void> {
    const existing = await this.repository.findNamed(storeId, name);
    if (existing && existing !== roleId) throw teamError('ROLE_NAME_EXISTS');
  }

  private async find(storeId: string, roleId: string): Promise<Role> {
    const role = await this.repository.find(storeId, roleId);
    if (!role) throw teamError('ROLE_NOT_FOUND');
    return role;
  }

  private record(storeId: string, entityId: string, userId: string, action: string): Promise<void> {
    return this.audit.record(storeId, {
      actor: { kind: 'user', userId },
      action,
      entityType: 'role',
      entityId,
    });
  }

  private response(role: Role): RoleResponse {
    const { id, name, ...permissions } = role;
    return { id, name, permissions: customRolePermissionsSchema.parse(permissions) };
  }
}
