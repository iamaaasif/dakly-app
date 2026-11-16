import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { NotificationsRepository } from './notifications.repository';

describe('notification filters without RLS assistance', () => {
  const f = new OwnerIsolationFixture();
  const repository = new NotificationsRepository(f.tenant, f.connection.db);
  const card = (title: string) => ({
    type: 'conversation.handed_over',
    category: 'fix_now' as const,
    title,
    dedupeKey: 'chat-1',
  });
  const page = { limit: 50 };
  beforeAll(() => f.setup());
  afterAll(async () => {
    await f.connection.pool.query('delete from notifications where store_id=any($1::uuid[])', [
      [f.a, f.b],
    ]);
    await f.close();
  });

  it('inserts, lists, finds and changes rows only in the selected store and user', async () => {
    const [a] = await repository.insertForUsers(f.a, [f.userA], card('রিনার কার্ড'));
    const [b] = await repository.insertForUsers(f.b, [f.userB], card('করিমের কার্ড'));
    expect((await f.row('notifications', b!.id)).store_id).toBe(f.b);
    expect(await repository.insertForUsers(f.b, [f.userB], card('আবার'))).toEqual([]);

    expect((await repository.list(f.a, f.userA, page)).map((row) => row.id)).toEqual([a!.id]);
    expect(await repository.list(f.b, f.userA, page)).toEqual([]);
    expect(await repository.list(f.b, f.userB, { ...page, cursor: a!.id })).toEqual([]);
    expect(await repository.findForUser(f.b, f.userB, a!.id)).toBeUndefined();
    expect(await repository.findForUser(f.a, f.userA, a!.id)).toMatchObject({
      title: 'রিনার কার্ড',
    });

    const done = { from: ['new' as const], to: 'done' as const, snoozedUntil: null };
    expect(await repository.changeStatus(f.b, f.userB, a!.id, done)).toBe(false);
    expect(await repository.changeStatus(f.a, f.userB, a!.id, done)).toBe(false);
    expect((await f.row('notifications', a!.id)).status).toBe('new');
    expect(await repository.changeStatus(f.a, f.userA, a!.id, done)).toBe(true);
    expect(await repository.changeStatus(f.a, f.userA, a!.id, done)).toBe(false);
    expect((await f.row('notifications', b!.id)).status).toBe('new');
  });

  it('wakes due snoozed cards only in the selected store', async () => {
    const snooze = { ...card('ঘুমন্ত কার্ড'), dedupeKey: 'chat-2' };
    const [a] = await repository.insertForUsers(f.a, [f.userA], snooze);
    const [b] = await repository.insertForUsers(f.b, [f.userB], snooze);
    await f.connection.pool.query(
      "update notifications set status='snoozed', snoozed_until=now()-interval '1 minute' where id=any($1::uuid[])",
      [[a!.id, b!.id]],
    );
    const now = new Date();
    await repository.wakeSnoozed(f.b, now);
    expect((await f.row('notifications', a!.id)).status).toBe('snoozed');
    expect((await f.row('notifications', b!.id)).status).toBe('new');
    await repository.wakeSnoozed(f.a, now);
    expect((await f.row('notifications', a!.id)).status).toBe('new');
  });
});
