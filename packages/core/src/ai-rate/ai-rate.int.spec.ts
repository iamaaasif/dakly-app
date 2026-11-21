import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDatabase } from '@dakly/db/client';

import { StaffDatabase } from '../platform/database/staff-database';
import { AiRateRepository } from './ai-rate.repository';

describe('AI rate setting', () => {
  const owner = createDatabase(process.env.DATABASE_ADMIN_URL!);
  const app = createDatabase(process.env.DATABASE_URL!);
  const repository = new AiRateRepository(app.db, new StaffDatabase(app.db));
  const staffId = randomUUID();

  beforeAll(async () => {
    await owner.pool.query(
      "insert into staff_users(id,name,email,role,access_subject,enrolled_at) values($1::uuid,'Finance',$2,'finance',$1::text,now())",
      [staffId, `${staffId}@example.test`],
    );
    await owner.pool.query("delete from platform_settings where key='ai_usd_poisha_rate'");
  });

  afterAll(async () => {
    await owner.pool.query("delete from platform_settings where key='ai_usd_poisha_rate'");
    await owner.pool.query('delete from staff_audit_log where staff_user_id=$1', [staffId]);
    await owner.pool.query('delete from staff_users where id=$1', [staffId]);
    await app.pool.end();
    await owner.pool.end();
  });

  it('saves the rate with an audit row, and a second change replaces it', async () => {
    expect(await repository.read()).toBeUndefined();
    await repository.change({
      id: randomUUID(),
      staffUserId: staffId,
      poishaPerUsd: 12300,
      reason: 'Monthly rate update',
      ip: '127.0.0.1',
    });
    await repository.change({
      id: randomUUID(),
      staffUserId: staffId,
      poishaPerUsd: 12450,
      reason: 'Rate moved again',
      ip: '127.0.0.1',
    });
    expect((await repository.read())?.value).toEqual({ poishaPerUsd: 12450 });
    const audit = await owner.pool.query(
      "select action from staff_audit_log where staff_user_id=$1 and action='ai_rate.changed'",
      [staffId],
    );
    expect(audit.rowCount).toBe(2);
  });
});
