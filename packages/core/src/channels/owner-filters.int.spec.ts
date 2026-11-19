import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { ChannelConnectionsRepository } from './channel-connections.repository';

describe('ChannelConnectionsRepository', () => {
  const fixture = new OwnerIsolationFixture();
  const repository = new ChannelConnectionsRepository(fixture.tenant, fixture.connection.db);
  const page = randomUUID();
  const instagram = randomUUID();
  const whatsapp = randomUUID();
  beforeAll(async () => {
    await fixture.setup();
    await fixture.connection.pool.query(
      `insert into channel_connections(id,store_id,kind,external_account_id,display_name)
       values($1::uuid,$2,'facebook_page',$1::text,'রিনার পেজ'),
             ($3::uuid,$4,'instagram',$3::text,'করিমের দোকান'),
             ($5::uuid,$2,'whatsapp',$5::text,'রিনার নম্বর')`,
      [page, fixture.a, instagram, fixture.b, whatsapp],
    );
  });
  afterAll(() => fixture.close());

  it('finds only submitted Meta posting accounts in the requested store', async () => {
    const { a, b } = fixture;
    expect(
      await repository.findPostingConnections(a, [page, instagram, whatsapp, randomUUID()]),
    ).toMatchObject([{ id: page, kind: 'facebook_page' }]);
    expect(await repository.findPostingConnections(b, [page])).toEqual([]);
    expect(await repository.findPostingConnections(b, [instagram])).toMatchObject([
      { id: instagram, kind: 'instagram' },
    ]);
  });
});
