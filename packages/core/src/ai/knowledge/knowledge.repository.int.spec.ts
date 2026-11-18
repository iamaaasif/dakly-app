import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDatabase } from '@dakly/db/client';

import { OwnerIsolationFixture } from '../../../test/owner-isolation-fixture';
import { TenantDatabase } from '../../platform/database/tenant-database';
import { KnowledgeRepository } from './knowledge.repository';

describe('KnowledgeRepository', () => {
  const fixture = new OwnerIsolationFixture();
  const app = createDatabase(process.env.DATABASE_URL!);
  const repository = new KnowledgeRepository(new TenantDatabase(app.db));
  const now = new Date('2026-11-18T15:00:00Z');

  beforeAll(async () => fixture.setup());
  afterAll(async () => {
    await app.pool.end();
    await fixture.connection.pool.query(
      'delete from knowledge_items where store_id=any($1::uuid[])',
      [[fixture.a, fixture.b]],
    );
    await fixture.close();
  });

  it('keeps text, reads and changes within the chosen store', async () => {
    const item = await repository.create(
      fixture.a,
      fixture.userA,
      { kind: 'policy', answer: 'ঢাকায় ডেলিভারি ৬০ টাকা।' },
      now,
    );

    expect(await repository.find(fixture.b, item.id)).toBeUndefined();
    expect(await repository.list(fixture.b, { limit: 50 })).toEqual([]);
    expect(await repository.change(fixture.b, item.id, { answer: 'অন্যান্য' }, now)).toBeUndefined();
    expect(await repository.remove(fixture.b, item.id)).toBe(false);
    await expect(repository.find(fixture.a, item.id)).resolves.toMatchObject({
      answer: 'ঢাকায় ডেলিভারি ৬০ টাকা।',
      status: 'processing',
    });
  });
});
