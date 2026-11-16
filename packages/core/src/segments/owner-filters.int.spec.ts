import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { SegmentsRepository } from './segments.repository';

const rules = {
  match: 'all',
  conditions: [{ field: 'tag', operator: 'is_any_of', values: ['vip'] }],
} as const;
const page = { limit: 100 };

describe('segment filters without RLS assistance', () => {
  const f = new OwnerIsolationFixture();
  const repository = new SegmentsRepository(f.tenant);
  beforeAll(() => f.setup());
  afterAll(() => f.close());

  it('saves into the selected store and reads, changes and deletes only its segments', async () => {
    const a = await repository.insert(f.a, { name: 'ভিআইপি', rules, createdByUserId: f.userA });
    const b = await repository.insert(f.b, { name: 'ভিআইপি', rules, createdByUserId: f.userB });

    expect((await f.row('segments', b.id)).store_id).toBe(f.b);
    expect(await repository.find(f.b, a.id)).toBeUndefined();
    expect(await repository.findIdByName(f.b, 'ভিআইপি')).toBe(b.id);
    expect((await repository.list(f.b, page)).map((segment) => segment.id)).toEqual([b.id]);
    expect(await repository.countSaved(f.b)).toBe(1);

    const now = new Date('2026-11-16T05:00:00Z');
    expect(await repository.change(f.b, a.id, { name: 'চুরি', updatedAt: now })).toBeUndefined();
    expect(await repository.remove(f.b, a.id)).toBe(false);
    expect(await repository.find(f.a, a.id)).toMatchObject({ name: 'ভিআইপি' });
  });
});
