import { randomUUID } from 'node:crypto';

import { beforeAll, afterAll, it, expect } from 'vitest';

import { createDatabase } from '@dakly/db/client';

const owner = createDatabase(process.env.DATABASE_ADMIN_URL!);
const application = createDatabase(process.env.DATABASE_URL!);
const schema = `seal_${randomUUID().replaceAll('-', '')}`;
// Clone the actual installed functions into an isolated schema. Only the clock source changes;
// every lock, stamp, canonicalization and seal statement is the installed production algorithm.
beforeAll(async () => {
  await owner.pool.query(`create schema ${schema}; grant usage on schema ${schema} to dakly_app`);
  await owner.pool.query(
    `create table ${schema}.staff_audit_log (like public.staff_audit_log including all);create table ${schema}.staff_audit_log_days (like public.staff_audit_log_days including all);create table ${schema}.test_clock(instant timestamptz not null);insert into ${schema}.test_clock values('2030-01-01T23:59:59.123456Z');create function ${schema}.clock() returns timestamptz language sql volatile as 'select instant from ${schema}.test_clock';grant select on ${schema}.test_clock to dakly_app;grant select,insert on ${schema}.staff_audit_log to dakly_app;grant select on ${schema}.staff_audit_log_days to dakly_app`,
  );
  for (const signature of [
    'stamp_staff_audit()',
    'staff_audit_day_hash(date,bytea)',
    'seal_staff_audit_day()',
  ]) {
    const result = await owner.pool.query(
      'select pg_get_functiondef($1::regprocedure) as definition',
      [signature],
    );
    const definition = String(result.rows[0].definition)
      .replaceAll('public.', `${schema}.`)
      .replaceAll('clock_timestamp()', `${schema}.clock()`);
    await owner.pool.query(definition);
    await owner.pool.query(`grant execute on function ${schema}.${signature} to dakly_app`);
  }
  await owner.pool.query(
    `create trigger staff_audit_timestamp before insert on ${schema}.staff_audit_log for each row execute function ${schema}.stamp_staff_audit()`,
  );
});
afterAll(async () => {
  await owner.pool.query(`drop schema ${schema} cascade`);
  await Promise.all([owner.pool.end(), application.pool.end()]);
});
it('seals late commits across UTC midnight, catches empty days, preserves microseconds and detects tampering', async () => {
  const first = randomUUID(),
    late = randomUUID(),
    next = randomUUID();
  const insert = (id: string) =>
    [
      `insert into ${schema}.staff_audit_log(id,operator_identity,action,reason) values($1,'operator-one','fixture.action','Test canonical audit fields')`,
      [id],
    ] as const;
  await application.pool.query(...insert(first));
  const writer = await application.pool.connect();
  const sealConnection = await application.pool.connect();
  let seal: Promise<import('pg').QueryResult> | undefined;
  try {
    await writer.query('begin');
    await writer.query(...insert(late));
    expect(
      (
        await writer.query(
          `select to_char(created_at at time zone 'UTC','YYYY-MM-DD HH24:MI:SS.US') as value from ${schema}.staff_audit_log where id=$1`,
          [late],
        )
      ).rows[0].value,
    ).toBe('2030-01-01 23:59:59.123456');
    await owner.pool.query(`update ${schema}.test_clock set instant='2030-01-02T00:00:00.654321Z'`);
    const pid = (await sealConnection.query('select pg_backend_pid() as pid')).rows[0].pid;
    seal = sealConnection.query(`select ${schema}.seal_staff_audit_day()::text as day`);
    await expect
      .poll(
        async () =>
          (await owner.pool.query('select wait_event from pg_stat_activity where pid=$1', [pid]))
            .rows[0]?.wait_event,
        { timeout: 2000 },
      )
      .toBe('advisory');
    // New-day writes do not wait on the prior day's exclusive seal lock.
    await application.pool.query(...insert(next));
    await writer.query('commit');
    expect((await seal).rows[0].day).toBe('2030-01-01');
    expect(
      (
        await owner.pool.query(
          `select row_count from ${schema}.staff_audit_log_days where day='2030-01-01'`,
        )
      ).rows[0].row_count,
    ).toBe(2);
    await owner.pool.query(`update ${schema}.test_clock set instant='2030-01-04T00:00:00Z'`);
    for (const expected of ['2030-01-02', '2030-01-03', null])
      expect(
        (await application.pool.query(`select ${schema}.seal_staff_audit_day()::text as day`))
          .rows[0].day,
      ).toBe(expected);
    expect(
      (
        await owner.pool.query(`select row_count from ${schema}.staff_audit_log_days order by day`)
      ).rows.map((row) => row.row_count),
    ).toEqual([2, 1, 0]);
    const verify = () =>
      owner.pool.query(
        `select d.hash=h.hash and d.row_count=h.row_count as valid from ${schema}.staff_audit_log_days d cross join lateral ${schema}.staff_audit_day_hash(d.day,d.previous_hash) h order by d.day`,
      );
    expect((await verify()).rows.map((row) => row.valid)).toEqual([true, true, true]);
    await owner.pool.query(
      `update ${schema}.staff_audit_log set operator_identity='tampered-operator' where id=$1`,
      [late],
    );
    expect((await verify()).rows.map((row) => row.valid)).toEqual([false, true, true]);
  } finally {
    await writer.query('rollback');
    await seal?.catch(() => undefined);
    writer.release();
    sealConnection.release();
  }
});
it('denies audit mutations and direct seal writes to the actual application role', async () => {
  for (const statement of [
    'update staff_audit_log set reason=reason where false',
    'delete from staff_audit_log where false',
    'truncate staff_audit_log',
    'delete from staff_audit_log_days where false',
    "insert into staff_audit_log_days(day,row_count,hash,sealed_at) values('1900-01-01',0,decode('00','hex'),now())",
  ])
    await expect(application.pool.query(statement)).rejects.toThrow(/permission denied/);
});
