import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { AuditRepository } from './audit.repository';

describe('audit filters without RLS assistance', () => {
  const f = new OwnerIsolationFixture();
  const repository = new AuditRepository(f.tenant);
  beforeAll(() => f.setup());
  afterAll(() => f.close());
  it('writes the entry into the requested store only', async () => {
    const entityId = randomUUID();
    await f.tenant.forStore(f.b, () =>
      repository.insert(f.b, {
        actor: { kind: 'user', userId: f.userB },
        action: 'customer.created',
        entityType: 'customer',
        entityId,
      }),
    );
    const rows = await f.connection.pool.query(
      'select store_id from audit_log where entity_id=$1',
      [entityId],
    );
    expect(rows.rows).toEqual([{ store_id: f.b }]);
  });
});
