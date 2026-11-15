import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { Pool, type PoolClient } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';

const url = process.env.DATABASE_ADMIN_URL;
if (!url) throw new Error('DATABASE_ADMIN_URL is required');
const pool = new Pool({ connectionString: url });
const migrations = path.resolve(__dirname, '../../../../db/migrations');
afterAll(() => pool.end());

describe('plan catalogue and coupon data (Postgres)', () => {
  it.each([-1, 91])('rejects a trial length of %i days', async (days) => {
    await withTransaction(async (client) => {
      await expect(insertPlan(client, 'invalid-trial', days)).rejects.toMatchObject({
        code: '23514',
        constraint: 'plans_trial_days',
      });
    });
  });

  it.each([0, 90])('accepts a trial length of %i days', async (days) => {
    await withTransaction(async (client) => {
      await insertPlan(client, 'valid-trial', days);
      const result = await client.query('select trial_days from plans where code = $1', [
        'valid-trial',
      ]);
      expect(result.rows).toEqual([{ trial_days: days }]);
    });
  });

  it.each([
    ['months', null],
    ['months', 0],
    ['months', 37],
    ['once', 3],
    ['forever', 3],
  ])('rejects duration %s with months %s', async (duration, months) => {
    await withTransaction(async (client) => {
      await expect(insertCoupon(client, duration, months)).rejects.toMatchObject({
        code: '23514',
        constraint: 'coupons_duration_months',
      });
    });
  });

  it.each([
    ['once', null],
    ['forever', null],
    ['months', 1],
    ['months', 36],
  ])('accepts duration %s with months %s', async (duration, months) => {
    await withTransaction(async (client) => {
      const id = await insertCoupon(client, duration, months);
      const result = await client.query(
        'select duration, duration_months from coupons where id = $1',
        [id],
      );
      expect(result.rows).toEqual([{ duration, duration_months: months }]);
    });
  });

  it.each([
    'discount_percent = 20',
    "kind = 'amount', discount_percent = null, discount_amount_poisha = 100",
    "duration = 'forever', duration_months = null",
    'duration_months = 6',
    'redemption_count = 0',
  ])('refuses to change a redeemed coupon: %s', async (change) => {
    await withTransaction(async (client) => {
      const id = await insertCoupon(client, 'months', 3);
      await client.query('update coupons set redemption_count = 1 where id = $1', [id]);
      await expect(
        client.query(`update coupons set ${change} where id = $1`, [id]),
      ).rejects.toMatchObject({ code: '23514' });
    });
  });

  it('allows editing an unused coupon and increasing its lifetime redemption count', async () => {
    await withTransaction(async (client) => {
      const id = await insertCoupon(client, 'months', 3);
      await client.query(
        'update coupons set discount_percent = 20, redemption_count = 1 where id = $1',
        [id],
      );
      await client.query(
        'update coupons set redemption_count = 2, max_redemptions = 5 where id = $1',
        [id],
      );
      const result = await client.query(
        'select discount_percent, redemption_count, max_redemptions from coupons where id = $1',
        [id],
      );
      expect(result.rows).toEqual([
        { discount_percent: 20, redemption_count: 2, max_redemptions: 5 },
      ]);
    });
  });

  it.each([false, true])(
    'starts the catalogue with the same trials (previously seeded: %s)',
    async (seeded) => {
      await withTransaction(async (client) => {
        // The real migration runs against an isolated copy, leaving existing subscriptions intact.
        await client.query(
          'create temporary table plans (like public.plans including all) on commit drop',
        );
        if (seeded) {
          for (const code of ['free', 'starter', 'growth', 'pro'])
            await insertPlan(client, code, 0);
        }
        await runCatalogueMigration(client);
        const result = await client.query('select code, trial_days from plans order by position');
        expect(result.rows).toEqual([
          { code: 'free', trial_days: 0 },
          { code: 'starter', trial_days: 14 },
          { code: 'growth', trial_days: 14 },
          { code: 'pro', trial_days: 14 },
        ]);
      });
    },
  );

  it('preserves existing catalogue edits and nonzero trial lengths', async () => {
    await withTransaction(async (client) => {
      await client.query(
        'create temporary table plans (like public.plans including all) on commit drop',
      );
      await insertPlan(client, 'growth', 21);
      await client.query(
        "update plans set name = 'Edited', monthly_price_poisha = 123, is_public = false, limits = '{\"seats\":99}' where code = 'growth'",
      );
      await runCatalogueMigration(client);
      const result = await client.query(
        "select name, trial_days, monthly_price_poisha, is_public, limits from plans where code = 'growth'",
      );
      expect(result.rows).toEqual([
        {
          name: 'Edited',
          trial_days: 21,
          monthly_price_poisha: '123',
          is_public: false,
          limits: { seats: 99 },
        },
      ]);
    });
  });
});

async function insertPlan(client: PoolClient, code: string, days: number) {
  const position = ['free', 'starter', 'growth', 'pro'].indexOf(code);
  await client.query(
    'insert into plans (id, code, name, monthly_price_poisha, yearly_price_poisha, limits, trial_days, position) values ($1, $2, $2, 0, 0, $3, $4, $5)',
    [randomUUID(), code, {}, days, position],
  );
}

async function insertCoupon(client: PoolClient, duration: unknown, months: unknown) {
  const id = randomUUID();
  await client.query(
    "insert into coupons (id, code, kind, discount_percent, valid_from, duration, duration_months) values ($1::uuid, $1::text, 'percent', 10, now(), $2, $3)",
    [id, duration, months],
  );
  return id;
}

async function runCatalogueMigration(client: PoolClient) {
  const file = readdirSync(migrations).find((name) => name.endsWith('_plans_catalogue.sql'));
  if (!file) throw new Error('Plan catalogue migration is missing');
  await client.query(readFileSync(path.join(migrations, file), 'utf8'));
}

async function withTransaction(work: (client: PoolClient) => Promise<void>) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await work(client);
  } finally {
    await client.query('rollback');
    client.release();
  }
}
