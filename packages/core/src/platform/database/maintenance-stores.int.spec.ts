import { Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';

const pool = new Pool({ connectionString: requireAdminUrl() });

afterAll(() => pool.end());

describe('maintenance store scan (Postgres)', () => {
  it('pages through active, suspended and closing stores before a global rollup can finish', async () => {
    const client = await pool.connect();
    const activeId = 'ffffffff-ffff-4fff-8fff-000000000001';
    const suspendedId = 'ffffffff-ffff-4fff-8fff-000000000002';
    const closingId = 'ffffffff-ffff-4fff-8fff-000000000003';
    try {
      await client.query('begin');
      await client.query(
        `insert into stores (id, name, status) values
        ($1, 'রূপার দোকান', 'active'), ($2, 'রহিমের দোকান', 'suspended'),
        ($3, 'করিমের দোকান', 'closing')`,
        [activeId, suspendedId, closingId],
      );
      await client.query('set local role dakly_app');
      const first = await client.query('select store_id from maintenance_store_ids($1, $2)', [
        'ffffffff-ffff-4fff-8fff-000000000000',
        2,
      ]);
      expect(first.rows).toEqual([{ store_id: activeId }, { store_id: suspendedId }]);
      const second = await client.query('select store_id from maintenance_store_ids($1, $2)', [
        suspendedId,
        2,
      ]);
      expect(second.rows).toEqual([{ store_id: closingId }]);
      const end = await client.query('select store_id from maintenance_store_ids($1, $2)', [
        closingId,
        2,
      ]);
      expect(end.rows).toEqual([]);
      const all = await client.query('select store_id from maintenance_store_ids(null, null)');
      expect(all.rows).toEqual(
        expect.arrayContaining([
          { store_id: activeId },
          { store_id: suspendedId },
          { store_id: closingId },
        ]),
      );
      const minimumPage = await client.query('select store_id from maintenance_store_ids($1, 0)', [
        'ffffffff-ffff-4fff-8fff-000000000000',
      ]);
      expect(minimumPage.rows).toEqual([{ store_id: activeId }]);
      const activeOnly = await client.query('select store_id from active_store_ids()');
      expect(activeOnly.rows).toContainEqual({ store_id: activeId });
      expect(activeOnly.rows).not.toContainEqual({ store_id: suspendedId });
      expect(activeOnly.rows).not.toContainEqual({ store_id: closingId });
    } finally {
      await client.query('rollback');
      client.release();
    }
  });
});

function requireAdminUrl(): string {
  const value = process.env['DATABASE_ADMIN_URL'];
  if (!value) throw new Error('DATABASE_ADMIN_URL is not set');
  return value;
}
