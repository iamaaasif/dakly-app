import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gt } from 'drizzle-orm';
import { memberships, roles } from '@dakly/db/schema/team';
import type { CreateRoleInput, RoleListQuery } from '@dakly/contracts/team';
import { TenantDatabase } from '../platform/database/tenant-database';

const roleColumns = {
  id: roles.id,
  name: roles.name,
  areas: roles.permissions,
  seeFullPhone: roles.canSeeFullPhone,
  exportLists: roles.canExportLists,
  refund: roles.canRefund,
};
export type Role = {
  id: string;
  name: string;
  areas: unknown;
  seeFullPhone: boolean;
  exportLists: boolean;
  refund: boolean;
};

@Injectable()
export class RolesRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  list(storeId: string, query: RoleListQuery): Promise<Role[]> {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select(roleColumns)
        .from(roles)
        .where(
          and(eq(roles.storeId, storeId), query.cursor ? gt(roles.id, query.cursor) : undefined),
        )
        .orderBy(asc(roles.id))
        .limit(query.limit + 1),
    );
  }
  async find(storeId: string, roleId: string): Promise<Role | undefined> {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .select(roleColumns)
        .from(roles)
        .where(and(eq(roles.storeId, storeId), eq(roles.id, roleId)))
        .limit(1),
    );
    return row;
  }
  async findNamed(storeId: string, name: string): Promise<string | undefined> {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .select({ id: roles.id })
        .from(roles)
        .where(and(eq(roles.storeId, storeId), eq(roles.name, name)))
        .limit(1),
    );
    return row?.id;
  }
  async isReferenced(storeId: string, roleId: string): Promise<boolean> {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .select({ id: memberships.id })
        .from(memberships)
        .where(and(eq(memberships.storeId, storeId), eq(memberships.roleId, roleId)))
        .limit(1),
    );
    return Boolean(row);
  }
  async insert(storeId: string, input: CreateRoleInput): Promise<Role> {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .insert(roles)
        .values({ storeId, ...roleValues(input) })
        .returning(roleColumns),
    );
    return row!;
  }
  async change(
    storeId: string,
    roleId: string,
    input: CreateRoleInput,
    now: Date,
  ): Promise<Role | undefined> {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .update(roles)
        .set({ ...roleValues(input), updatedAt: now })
        .where(and(eq(roles.storeId, storeId), eq(roles.id, roleId)))
        .returning(roleColumns),
    );
    return row;
  }
  async remove(storeId: string, roleId: string): Promise<void> {
    await this.database.forStore(storeId, (tx) =>
      tx.delete(roles).where(and(eq(roles.storeId, storeId), eq(roles.id, roleId))),
    );
  }
}
function roleValues(input: CreateRoleInput) {
  return {
    name: input.name,
    permissions: input.permissions.areas,
    canSeeFullPhone: input.permissions.seeFullPhone,
    canExportLists: input.permissions.exportLists,
    canRefund: input.permissions.refund,
  };
}
