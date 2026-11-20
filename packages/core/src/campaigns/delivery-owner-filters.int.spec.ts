import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { CampaignCountsRepository } from './campaign-counts.repository';
import { CampaignSendingRepository } from './campaign-sending.repository';
import { CampaignsRepository } from './campaigns.repository';

const now = new Date('2026-11-16T05:00:00Z');

describe('campaign sending filters without RLS assistance', () => {
  const f = new OwnerIsolationFixture();
  const repository = new CampaignSendingRepository(f.tenant, f.connection.db);
  const campaigns = new CampaignsRepository(f.tenant);
  const counts = new CampaignCountsRepository(f.tenant);
  let campaignA: string;
  let recipientA: string;
  let contactA: string;
  beforeAll(async () => {
    await f.setup();
    campaignA = randomUUID();
    recipientA = randomUUID();
    contactA = randomUUID();
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
    await expect(campaigns.lockCampaign(f.a, campaignA, 'share')).rejects.toThrow(
      'active store transaction',
    );
    await expect(campaigns.lockCampaign(f.a, campaignA, 'update')).rejects.toThrow(
      'active store transaction',
    );
    await expect(
      repository.lockNextRecipient(f.a, { id: campaignA, status: 'sending' }, now),
    ).rejects.toThrow('active store transaction');
  });

  it('starts, locks, claims and settles only the selected store’s campaigns', async () => {
    const before = await f.row('campaigns', campaignA);
    const recipientBefore = await f.row('campaign_recipients', recipientA);

    await repository.startDueInStore(f.b, now);
    expect(await f.row('campaigns', campaignA)).toEqual(before);
    await repository.startDueInStore(f.a, now);
    expect((await f.row('campaigns', campaignA)).status).toBe('sending');

    await f.tenant.forStore(f.b, async () => {
      expect(await campaigns.lockCampaign(f.b, campaignA, 'share')).toBeUndefined();
      expect(await campaigns.lockCampaign(f.b, campaignA, 'update')).toBeUndefined();
      expect(
        await repository.lockNextRecipient(f.b, { id: campaignA, status: 'sending' }, now),
      ).toBeUndefined();
      expect(await campaigns.settlementTotals(f.b, campaignA)).toEqual({
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
      expect(await campaigns.lockCampaign(f.a, campaignA, 'share')).toMatchObject({
        id: campaignA,
      });
      expect(
        await repository.lockNextRecipient(f.a, { id: campaignA, status: 'sending' }, now),
      ).toMatchObject({
        id: recipientA,
        status: 'queued',
      });
      expect(await campaigns.settlementTotals(f.a, campaignA)).toEqual({
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

  it('reads and writes campaign counts only in the selected store', async () => {
    const recipientBefore = await f.row('campaign_recipients', recipientA);
    const tap = { campaignId: campaignA, contactId: contactA, at: now };
    await f.tenant.forStore(f.a, async () => {
      await counts.save(f.a, campaignA, now);
    });
    const saved = await f.row('campaigns', campaignA);
    expect(saved).toMatchObject({ counts_at: '2026-11-16T05:00:00+00:00' });
    await f.tenant.forStore(f.b, async () => {
      await counts.save(f.b, campaignA, new Date(now.getTime() + 1_000));
      await counts.markPending(f.b, campaignA);
      await counts.recordTap(f.b, tap);
    });
    expect(await f.row('campaigns', campaignA)).toEqual(saved);
    expect(await f.row('campaign_recipients', recipientA)).toEqual(recipientBefore);
    await f.tenant.forStore(f.a, () => counts.recordTap(f.a, tap));
    expect(await f.row('campaigns', campaignA)).toMatchObject({
      tapped_count: 1,
      counts_at: '2026-11-16T05:00:00+00:00',
    });
    expect(await f.row('campaign_recipients', recipientA)).toMatchObject({
      tapped_at: '2026-11-16T05:00:00+00:00',
    });
    await f.tenant.forStore(f.a, () => counts.markPending(f.a, campaignA));
    expect(await f.row('campaigns', campaignA)).toMatchObject({ counts_at: null });
    await f.connection.pool.query('update campaigns set status=$2 where id=$1', [
      campaignA,
      'sent',
    ]);
    expect(await counts.nextPending(f.b)).toBeUndefined();
    expect(await counts.nextPending(f.a)).toBe(campaignA);
  });
});
