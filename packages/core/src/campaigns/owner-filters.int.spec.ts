import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { CampaignsRepository } from './campaigns.repository';

const draft = {
  name: 'ঈদের অফার',
  goal: 'seasonal',
  channel: 'sms',
  content: { text: 'ঈদে সব শাড়িতে ২০% ছাড়' },
  includeSegmentIds: [],
  excludeSegmentIds: [],
  scheduledFor: null,
} as const;
const page = { limit: 100 };

describe('campaign filters without RLS assistance', () => {
  const f = new OwnerIsolationFixture();
  const repository = new CampaignsRepository(f.tenant);
  beforeAll(() => f.setup());
  afterAll(() => f.close());

  it('saves into the selected store and reads, changes and deletes only its campaigns', async () => {
    const a = await repository.insert(f.a, { ...draft, createdByUserId: f.userA });
    const b = await repository.insert(f.b, { ...draft, createdByUserId: f.userB });

    expect((await f.row('campaigns', b.id)).store_id).toBe(f.b);
    expect(await repository.find(f.b, a.id)).toBeUndefined();
    expect((await repository.list(f.b, page)).map((campaign) => campaign.id)).toEqual([b.id]);

    const now = new Date('2026-11-16T05:00:00Z');
    expect(
      await repository.changeDraft(f.b, a.id, { name: 'চুরি', updatedAt: now }),
    ).toBeUndefined();
    expect(await repository.removeDraft(f.b, a.id)).toBe(false);
    expect(await repository.find(f.a, a.id)).toMatchObject({ name: 'ঈদের অফার' });
  });

  it('locks, freezes recipients for and approves only the selected store’s drafts', async () => {
    const a = await repository.insert(f.a, { ...draft, createdByUserId: f.userA });
    const b = await repository.insert(f.b, { ...draft, createdByUserId: f.userB });
    const [contactA, contactB] = [randomUUID(), randomUUID()];
    for (const [id, storeId] of [
      [contactA, f.a],
      [contactB, f.b],
    ])
      await f.connection.pool.query(
        "insert into contacts(id,store_id,name,source,kind) values($1,$2,'রিনা','manual','customer')",
        [id, storeId],
      );
    const before = await f.row('campaigns', a.id);

    expect(await repository.lockDraft(f.b, a.id)).toBeUndefined();
    expect(await repository.lockDraft(f.b, b.id)).toMatchObject({ id: b.id });
    await repository.insertRecipients(f.b, b.id, [
      {
        contactId: contactB,
        destinationAddress: null,
        status: 'skipped',
        skipReason: 'no_address',
      },
    ]);
    const now = new Date('2026-11-16T05:00:00Z');
    const approval = {
      status: 'sending',
      approvedByUserId: f.userB,
      approvedAt: now,
      updatedAt: now,
      estimatedCostPoisha: 0,
      recipientsCount: 1,
      skippedCount: 1,
    } as const;
    expect(await repository.markApproved(f.b, b.id, approval)).toMatchObject({ status: 'sending' });
    await repository.markApproved(f.b, a.id, approval);

    expect(await f.row('campaigns', a.id)).toEqual(before);
    const { rows } = await f.connection.pool.query(
      'select store_id, campaign_id from campaign_recipients where contact_id=any($1::uuid[])',
      [[contactA, contactB]],
    );
    expect(rows).toEqual([{ store_id: f.b, campaign_id: b.id }]);
    await f.connection.pool.query('delete from contacts where id=any($1::uuid[])', [
      [contactA, contactB],
    ]);
  });
});
