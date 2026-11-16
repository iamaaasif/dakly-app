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
  async function saved(storeId: string, userId: string) {
    const segment = await repository.insert(storeId, {
      name: 'ভিআইপি',
      rules,
      createdByUserId: userId,
    });
    if (segment === 'name_taken') throw new Error('Fixture name already taken');
    return segment;
  }
  afterAll(() => f.close());

  it('saves into the selected store and reads, changes and deletes only its segments', async () => {
    const a = await saved(f.a, f.userA);
    const b = await saved(f.b, f.userB);

    expect((await f.row('segments', b.id)).store_id).toBe(f.b);
    expect(await repository.find(f.b, a.id)).toBeUndefined();
    // Each store saved the name once; a second save in the same store is refused.
    expect(await repository.insert(f.b, { name: 'ভিআইপি', rules, createdByUserId: f.userB })).toBe(
      'name_taken',
    );
    expect((await repository.list(f.b, page)).map((segment) => segment.id)).toEqual([b.id]);
    expect(await repository.countSaved(f.b)).toBe(1);

    const now = new Date('2026-11-16T05:00:00Z');
    expect(await repository.change(f.b, a.id, { name: 'চুরি', updatedAt: now })).toBeUndefined();
    expect(await repository.remove(f.b, a.id)).toBe(false);
    expect(await repository.find(f.a, a.id)).toMatchObject({ name: 'ভিআইপি' });
  });
});
