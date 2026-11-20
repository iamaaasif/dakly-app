import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { StoreAccess } from '@dakly/contracts/team';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { SocialRepository } from './social.repository';
import { SocialService } from './social.service';

describe('SocialService post photos', () => {
  const fixture = new OwnerIsolationFixture();
  const now = new Date('2026-11-20T06:00:00Z');

  beforeAll(() => fixture.setup());
  afterAll(() => fixture.close());

  function socialService() {
    // Only the photo lookup is under test, so the other services are never called.
    const unused = {} as never;
    return new SocialService(
      new SocialRepository(fixture.tenant),
      unused,
      unused,
      unused,
      unused,
      { now: () => now },
      unused,
      unused,
      { createDownloadUrl: (key: string) => `https://storage.test/${key}` },
    );
  }

  async function insertFile(status: 'ready' | 'pending', storeId = fixture.a, expiresAt?: Date) {
    const id = randomUUID();
    await fixture.connection.pool.query(
      "insert into files(id,store_id,purpose,object_key,content_type,size_bytes,status,expires_at) values($1::uuid,$2,'post_media',$1::text,'image/jpeg',42,$3,$4)",
      [id, storeId, status, expiresAt ?? null],
    );
    return id;
  }

  it('returns a link for each ready photo, in order, and leaves out a photo that is not ready', async () => {
    const [first, second, pending] = await Promise.all([
      insertFile('ready'),
      insertFile('ready'),
      insertFile('pending'),
    ]);
    const postId = randomUUID();
    await fixture.connection.pool.query(
      "insert into posts(id,store_id,caption,media_file_ids,created_by_user_id) values($1,$2,'Eid sale',$3,$4)",
      [postId, fixture.a, [second, pending, first], fixture.userA],
    );

    const post = await socialService().getPost(
      fixture.a,
      postId,
      { kind: 'user', userId: fixture.userA },
      {} as StoreAccess,
    );

    expect(post.photos).toEqual([
      { id: second, url: `https://storage.test/${second}` },
      { id: first, url: `https://storage.test/${first}` },
    ]);
  });

  it('returns no photos for a post without media', async () => {
    const postId = randomUUID();
    await fixture.connection.pool.query(
      "insert into posts(id,store_id,caption,media_file_ids,created_by_user_id) values($1,$2,'Text only',$3,$4)",
      [postId, fixture.a, [], fixture.userA],
    );

    const post = await socialService().getPost(
      fixture.a,
      postId,
      { kind: 'user', userId: fixture.userA },
      {} as StoreAccess,
    );

    expect(post.photos).toEqual([]);
  });

  it('lists several drafts with their own photos and ignores expired files and another store', async () => {
    const own = await insertFile('ready');
    const expired = await insertFile('ready', fixture.a, new Date(now.getTime() - 1000));
    const foreign = await insertFile('ready', fixture.b);
    const withPhoto = randomUUID();
    const withoutPhoto = randomUUID();
    for (const [id, files] of [
      [withPhoto, [own]],
      [withoutPhoto, [expired, foreign]],
    ] as const)
      await fixture.connection.pool.query(
        "insert into posts(id,store_id,caption,media_file_ids,created_by_user_id) values($1,$2,'Listed',$3,$4)",
        [id, fixture.a, files, fixture.userA],
      );

    const page = await socialService().listPosts(
      fixture.a,
      { limit: 100, drafts: 'mine' },
      { kind: 'user', userId: fixture.userA },
      {} as StoreAccess,
    );

    const photosOf = (id: string) => page.items.find((item) => item.id === id)?.photos;
    expect(photosOf(withPhoto)).toEqual([{ id: own, url: `https://storage.test/${own}` }]);
    expect(photosOf(withoutPhoto)).toEqual([]);
  });

  it('returns the results saved for a published target and null before the first pull', async () => {
    const connectionId = randomUUID();
    await fixture.connection.pool.query(
      "insert into channel_connections(id,store_id,kind,external_account_id,display_name) values($1::uuid,$2,'facebook_page',$1::text,'Page')",
      [connectionId, fixture.a],
    );
    const [measured, waiting] = [randomUUID(), randomUUID()];
    for (const [id, status, reach, linkTaps] of [
      [measured, 'published', 900, 12],
      [waiting, 'published', null, null],
    ] as const) {
      await fixture.connection.pool.query(
        "insert into posts(id,store_id,caption,created_by_user_id) values($1,$2,'Published',$3)",
        [id, fixture.a, fixture.userA],
      );
      await fixture.connection.pool.query(
        'insert into post_targets(id,store_id,post_id,channel_connection_id,status,scheduled_for,published_at,external_post_id,reach,reactions,comments,link_taps) values(gen_random_uuid(),$1,$2::uuid,$3,$4,$5,$5,$2::text,$6,$7,$7,$8)',
        [fixture.a, id, connectionId, status, now, reach, reach === null ? null : 40, linkTaps],
      );
    }

    const page = await socialService().listPosts(
      fixture.a,
      { limit: 100 },
      { kind: 'user', userId: fixture.userA },
      {} as StoreAccess,
    );

    const target = (id: string) => page.items.find((item) => item.id === id)?.targets[0];
    expect(target(measured)).toMatchObject({
      reach: 900,
      reactions: 40,
      comments: 40,
      linkTaps: 12,
    });
    expect(target(waiting)).toMatchObject({
      reach: null,
      reactions: null,
      comments: null,
      linkTaps: null,
    });
  });
});
