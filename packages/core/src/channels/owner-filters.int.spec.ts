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
  const settings = { messaging: { welcome: true } };
  const originalSlots = [{ weekday: 2, time: '13:30' }];
  const slots = [{ weekday: 5, time: '20:30' }];
  const now = new Date('2026-11-20T06:00:00Z');

  beforeAll(async () => {
    await fixture.setup();
    await fixture.connection.pool.query(
      `insert into channel_connections(id,store_id,kind,external_account_id,display_name,settings)
       values($1::uuid,$2,'facebook_page',$1::text,'রিনার পেজ',$7),
             ($4::uuid,$5,'instagram',$4::text,'করিমের দোকান',$3),
             ($6::uuid,$2,'whatsapp',$6::text,'রিনার নম্বর',$3)`,
      [
        page,
        fixture.a,
        settings,
        instagram,
        fixture.b,
        whatsapp,
        { ...settings, postingSlots: originalSlots },
      ],
    );
  });
  afterAll(() => fixture.close());

  it('finds only submitted Meta posting accounts in the requested store', async () => {
    const { a, b } = fixture;
    expect(
      await repository.findPostingConnections(a, [page, instagram, whatsapp, randomUUID()]),
    ).toMatchObject([{ id: page, kind: 'facebook_page', postingSlots: originalSlots }]);
    expect(await repository.findPostingConnections(b, [page])).toEqual([]);
    expect(await repository.findPostingConnections(b, [instagram])).toMatchObject([
      { id: instagram, kind: 'instagram' },
    ]);
  });

  it('replaces only posting slots and leaves another store’s settings untouched', async () => {
    const { a, b } = fixture;
    expect(
      await repository.savePostingSlots(a, { channelConnectionId: page, slots, now }),
    ).toMatchObject([{ id: page, postingSlots: slots }]);
    expect(
      await repository.savePostingSlots(b, { channelConnectionId: page, slots: [], now }),
    ).toEqual([]);
    expect(await fixture.row('channel_connections', page)).toMatchObject({
      settings: { ...settings, postingSlots: slots },
    });
    expect((await fixture.row('channel_connections', instagram)).settings).toEqual(settings);
    expect(
      await repository.savePostingSlots(a, { channelConnectionId: whatsapp, slots, now }),
    ).toEqual([]);
    expect(
      await repository.savePostingSlots(a, { channelConnectionId: page, slots: [], now }),
    ).toMatchObject([{ id: page, postingSlots: [] }]);
    await fixture.connection.pool.query(
      "update channel_connections set status='disconnected' where store_id=$1 and id=$2",
      [a, page],
    );
    expect(await repository.savePostingSlots(a, { channelConnectionId: page, slots, now })).toEqual(
      [],
    );
    expect((await fixture.row('channel_connections', page)).settings).toEqual({
      ...settings,
      postingSlots: [],
    });
  });
});
