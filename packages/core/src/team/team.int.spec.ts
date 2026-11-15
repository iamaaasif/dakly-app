import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDatabase } from '@dakly/db/client';
import { users } from '@dakly/db/schema/auth';
import { stores } from '@dakly/db/schema/stores';
import { memberships, roles } from '@dakly/db/schema/team';

import { AccountDatabase } from '../platform/database/account-database';
import { TenantDatabase } from '../platform/database/tenant-database';
import { TeamRepository } from './team.repository';
import { TeamService } from './team.service';

describe('TeamService (Postgres)', () => {
  const admin = createDatabase(process.env.DATABASE_ADMIN_URL!);
  const app = createDatabase(process.env.DATABASE_URL!);
  const service = new TeamService(
    new TeamRepository(new TenantDatabase(app.db), app.db, new AccountDatabase(app.db)),
  );
  let userId: string;
  let storeId: string;
  let otherStoreId: string;
  beforeAll(async () => {
    [userId] = (
      await admin.db
        .insert(users)
        .values({ name: 'Rina', email: `${crypto.randomUUID()}@example.test` })
        .returning({ id: users.id })
    ).map((row) => row.id);
    [storeId, otherStoreId] = (
      await admin.db
        .insert(stores)
        .values([{ name: 'Rina shop' }, { name: 'Other shop' }])
        .returning({ id: stores.id })
    ).map((row) => row.id);
    await admin.db
      .insert(memberships)
      .values({ storeId, userId, builtInRole: 'support_agent', status: 'active' });
  });
  afterAll(async () => {
    await admin.db.delete(memberships).where(eq(memberships.userId, userId));
    await admin.db.delete(roles).where(eq(roles.storeId, storeId));
    await admin.db.delete(stores).where(sql`${stores.id} in (${storeId}, ${otherStoreId})`);
    await admin.db.delete(users).where(eq(users.id, userId));
    await Promise.all([admin.pool.end(), app.pool.end()]);
  });
  it('reads active access and hides missing and removed memberships', async () => {
    expect(await service.accessFor(storeId, userId)).toMatchObject({
      role: 'support_agent',
      seeFullPhone: false,
      areas: { customers: 'view' },
    });
    expect(await service.accessFor(otherStoreId, userId)).toBeUndefined();
    expect((await service.storesFor(userId)).items).toEqual([{ storeId, name: 'Rina shop' }]);
    await admin.db
      .update(memberships)
      .set({ status: 'removed' })
      .where(eq(memberships.userId, userId));
    expect(await service.accessFor(storeId, userId)).toBeUndefined();
    expect((await service.storesFor(userId)).items).toEqual([]);
  });
  it('loads current custom role flags and areas in the membership query', async () => {
    const [role] = await admin.db
      .insert(roles)
      .values({
        storeId,
        name: 'Counter',
        permissions: { customers: 'edit' },
        canSeeFullPhone: true,
      })
      .returning({ id: roles.id });
    await admin.db
      .update(memberships)
      .set({ status: 'active', builtInRole: null, roleId: role!.id })
      .where(eq(memberships.userId, userId));
    expect(await service.accessFor(storeId, userId)).toMatchObject({
      role: 'custom',
      areas: { customers: 'edit' },
      seeFullPhone: true,
    });
    await admin.db
      .update(roles)
      .set({ permissions: { customers: 'none' }, canSeeFullPhone: false })
      .where(eq(roles.id, role!.id));
    expect(await service.accessFor(storeId, userId)).toMatchObject({
      areas: { customers: 'none' },
      seeFullPhone: false,
    });
  });
});
