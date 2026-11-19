import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { CampaignSendingRepository } from './campaign-sending.repository';

const now = new Date('2026-11-16T05:00:00Z');

describe('campaign sending filters without RLS assistance', () => {
  const f = new OwnerIsolationFixture();
  const repository = new CampaignSendingRepository(f.tenant, f.connection.db);
  let campaignA: string;
  let recipientA: string;
  beforeAll(async () => {
    await f.setup();
    campaignA = randomUUID();
    recipientA = randomUUID();
    const contactA = randomUUID();
    await f.connection.pool.query(
      "insert into contacts(id,store_id,name,source,kind) values($1,$2,'রিনা','manual','customer')",
      [contactA, f.a],
    );
    await f.connection.pool.query(
      `insert into campaigns(id,store_id,name,channel,content,status,scheduled_for,approved_at)
       values($1,$2,'ঈদের অফার','sms','{"text":"ঈদ"}','scheduled',$3,$3)`,
      [campaignA, f.a, now],
    );
    await f.connection.pool.query(
      "insert into campaign_recipients(id,store_id,campaign_id,contact_id,status) values($1,$2,$3,$4,'queued')",
      [recipientA, f.a, campaignA, contactA],
    );
  });
  afterAll(() => f.close());

  it('requires an active store transaction before taking campaign or recipient locks', async () => {
    await expect(repository.lockSending(f.a, campaignA)).rejects.toThrow(
      'active store transaction',
    );
    await expect(repository.lockForFinish(f.a, campaignA)).rejects.toThrow(
      'active store transaction',
    );
    await expect(repository.lockNextRecipient(f.a, campaignA, now)).rejects.toThrow(
      'active store transaction',
    );
  });

  it('starts, locks, claims and settles only the selected store’s campaigns', async () => {
    const before = await f.row('campaigns', campaignA);
    const recipientBefore = await f.row('campaign_recipients', recipientA);

    await repository.startDueInStore(f.b, now);
    expect(await f.row('campaigns', campaignA)).toEqual(before);
    await repository.startDueInStore(f.a, now);
    expect((await f.row('campaigns', campaignA)).status).toBe('sending');

    const laterCampaign = randomUUID();
    await f.connection.pool.query(
      `insert into campaigns(id,store_id,name,channel,content,status,started_at)
       values($1,$2,'পরের অফার','sms','{"text":"অফার"}','sending',$3)`,
      [laterCampaign, f.a, new Date(now.getTime() + 1000)],
    );
    const routes = await f.connection.pool.query('select * from campaign_sending_stores(null,100)');
    expect(routes.rows).toContainEqual({ store_id: f.a });
    expect(routes.fields.map(({ name }) => name)).toEqual(['store_id']);
    expect(await repository.listSendingStores(null, 100)).toContain(f.a);
    expect(await repository.firstSending(f.a)).toBe(campaignA);
    expect(await repository.firstSending(f.b)).toBeUndefined();

    await f.tenant.forStore(f.b, async () => {
      expect(await repository.lockSending(f.b, campaignA)).toBeUndefined();
      expect(await repository.lockForFinish(f.b, campaignA)).toBeUndefined();
      expect(await repository.lockNextRecipient(f.b, campaignA, now)).toBeUndefined();
      expect(await repository.settlement(f.b, campaignA)).toEqual({
        unsettled: 0,
        chargedCredits: 0,
      });
      expect(
        await repository.changeRecipient(
          f.b,
          recipientA,
          { status: 'queued' },
          { status: 'skipped', skipReason: 'blocked' },
        ),
      ).toBe(false);
    });
    expect(await f.row('campaign_recipients', recipientA)).toEqual(recipientBefore);

    await f.tenant.forStore(f.a, async () => {
      expect(await repository.lockSending(f.a, campaignA)).toMatchObject({ id: campaignA });
      expect(await repository.lockNextRecipient(f.a, campaignA, now)).toMatchObject({
        id: recipientA,
        status: 'queued',
      });
      expect(await repository.settlement(f.a, campaignA)).toEqual({
        unsettled: 1,
        chargedCredits: 0,
      });
      const claim = { status: 'sending', claimedAt: now, sendAttempts: 1 } as const;
      expect(await repository.changeRecipient(f.a, recipientA, { status: 'queued' }, claim)).toBe(
        true,
      );
      expect(await repository.changeRecipient(f.a, recipientA, { status: 'queued' }, claim)).toBe(
        false,
      );
    });
  });
});
