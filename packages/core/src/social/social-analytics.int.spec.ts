import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { SocialAnalyticsRepository } from './social-analytics.repository';
import { SocialAnalyticsService } from './social-analytics.service';

describe('social analytics read', () => {
  const f = new OwnerIsolationFixture();
  const service = new SocialAnalyticsService(new SocialAnalyticsRepository(f.tenant));
  const range = { from: '2026-11-10', through: '2026-11-10', timeZone: 'Asia/Dhaka' };
  const db = f.connection.pool;

  async function target(
    store: string,
    post: string,
    kind: string,
    publishedAt: string,
    numbers: [number | null, number | null],
    status = 'published',
  ) {
    const connection = randomUUID();
    await db.query(
      "insert into channel_connections(id,store_id,kind,external_account_id,display_name) values($1::uuid,$2,$3,$1::text,'Page')",
      [connection, store, kind],
    );
    await db.query(
      `insert into post_targets(id,store_id,post_id,channel_connection_id,status,published_at,reach,reactions)
       values($1,$2,$3,$4,$5,$6,$7,$8)`,
      [randomUUID(), store, post, connection, status, publishedAt, ...numbers],
    );
  }

  async function post(store: string, user: string, caption: string) {
    const id = randomUUID();
    await db.query(
      'insert into posts(id,store_id,caption,created_by_user_id) values($1,$2,$3,$4)',
      [id, store, caption, user],
    );
    return id;
  }

  beforeAll(async () => {
    await f.setup();
    // 2026-11-09T18:00Z is the first instant of 10 November in Dhaka.
    const both = await post(f.a, f.userA, 'Eid sale');
    await target(f.a, both, 'facebook_page', '2026-11-09T18:00:00Z', [100, 10]);
    await target(f.a, both, 'instagram', '2026-11-10T06:00:00Z', [50, null]);
    const before = await post(f.a, f.userA, 'Too early');
    await target(f.a, before, 'facebook_page', '2026-11-09T17:59:59Z', [9, 9]);
    const draft = await post(f.a, f.userA, 'Not published');
    await target(f.a, draft, 'facebook_page', '2026-11-10T06:00:00Z', [9, 9], 'failed');
    const other = await post(f.b, f.userB, 'Other store');
    await target(f.b, other, 'facebook_page', '2026-11-10T06:00:00Z', [7, 7]);
  });

  afterAll(async () => {
    await db.query('delete from post_targets where store_id=any($1::uuid[])', [[f.a, f.b]]);
    await f.close();
  });

  it('adds up the networks of one post and leaves out other days, unpublished targets and other stores', async () => {
    const posts = await service.publishedBetween(f.a, range);
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({
      caption: 'Eid sale',
      reach: 150,
      reactions: 10,
      comments: null,
    });
    expect(posts[0]?.networks.sort()).toEqual(['facebook_page', 'instagram']);
  });
});
