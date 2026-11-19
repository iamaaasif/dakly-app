import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { SavedRepliesRepository } from './saved-replies.repository';

describe('saved reply filters without RLS assistance', () => {
  const f = new OwnerIsolationFixture();
  const repository = new SavedRepliesRepository(f.tenant);
  const input = { title: 'ডেলিভারি', body: 'ডেলিভারি ৬০ টাকা।', shortcut: 'delivery' };
  const now = new Date('2026-11-19T06:00:00Z');

  beforeAll(() => f.setup());
  afterAll(async () => {
    try {
      await f.connection.pool.query('delete from saved_replies where store_id = any($1::uuid[])', [
        [f.a, f.b],
      ]);
    } finally {
      await f.close();
    }
  });

  it('lists, changes and deletes only replies in the selected store', async () => {
    const first = await repository.create(f.a, f.userA, input, now);
    const second = await repository.create(f.b, f.userB, input, now);
    if (!first || !second) throw new Error('Could not create saved reply fixtures');
    expect(await f.row('saved_replies', first.id)).toMatchObject({ store_id: f.a });
    expect(await f.row('saved_replies', second.id)).toMatchObject({ store_id: f.b });
    expect((await repository.list(f.b, { limit: 50 })).map((reply) => reply.id)).toEqual([
      second.id,
    ]);
    const change = { body: 'ডেলিভারি ৭০ টাকা।' };
    expect(await repository.update(f.b, first.id, change, now)).toBeUndefined();
    expect(await repository.remove(f.b, first.id)).toBe(false);
    expect(await f.row('saved_replies', first.id)).toMatchObject({ body: input.body });
    expect(await repository.update(f.b, second.id, change, now)).toMatchObject(change);
    expect(await repository.remove(f.b, second.id)).toBe(true);
    expect(await f.row('saved_replies', second.id)).toBeUndefined();
  });
});
