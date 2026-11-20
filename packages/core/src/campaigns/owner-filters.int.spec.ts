import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { CampaignApprovalRepository } from './campaign-approval.repository';
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
  const approvals = new CampaignApprovalRepository(f.tenant);
  beforeAll(() => f.setup());
  afterAll(() => f.close());

  it('saves into the selected store and reads, changes and deletes only its campaigns', async () => {
    const a = await repository.insert(f.a, { ...draft, createdByUserId: f.userA });
    const b = await repository.insert(f.b, { ...draft, createdByUserId: f.userB });

    expect((await f.row('campaigns', b.id)).store_id).toBe(f.b);
    expect(await repository.find(f.b, a.id)).toBeUndefined();
    expect((await repository.list(f.b, page)).map((campaign) => campaign.id)).toEqual([b.id]);
    const filtered = await repository.list(f.b, {
      ...page,
      search: 'ঈদ',
      status: 'draft',
      channel: 'sms',
    });
    expect(filtered.map(({ id }) => id)).toEqual([b.id]);

    const now = new Date('2026-11-16T05:00:00Z');
    expect(
      await repository.changeDraft(f.b, a.id, { name: 'চুরি', updatedAt: now }),
    ).toBeUndefined();
    expect(await repository.removeDraft(f.b, a.id)).toBe(false);
    expect(await repository.find(f.a, a.id)).toMatchObject({ name: 'ঈদের অফার' });
  });

  it('returns no campaigns when the cursor belongs to another store', async () => {
    const suffix = randomUUID().slice(8);
    const local = `10000000${suffix}`;
    const foreign = `20000000${suffix}`;
    await f.connection.pool.query(
      `insert into campaigns(id, store_id, name, channel, content, created_at)
       values ($1, $2, 'নববর্ষের অফার', 'sms', '{}', '2026-04-14T00:00:00Z'),
              ($3, $4, 'নববর্ষের অফার', 'sms', '{}', '2026-04-15T00:00:00Z')`,
      [local, f.a, foreign, f.b],
    );

    const query = { ...page, search: 'নববর্ষের অফার' };
    expect((await repository.list(f.a, query)).map(({ id }) => id)).toEqual([local]);
    expect((await repository.list(f.b, query)).map(({ id }) => id)).toEqual([foreign]);
    expect(await repository.list(f.a, { ...query, cursor: foreign })).toEqual([]);
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
      shortLinkBase: 'http://localhost:4000/l',
      startedAt: now,
      updatedAt: now,
      estimatedCostPoisha: 0,
      recipientsCount: 1,
      skippedCount: 1,
    } as const;
    expect(await repository.markApproved(f.b, b.id, approval)).toMatchObject({ status: 'sending' });
    expect(new Date(String((await f.row('campaigns', b.id)).started_at))).toEqual(now);
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

  it('locks, changes the status of and clears recipients for only the selected store', async () => {
    const [a, b] = [
      await repository.insert(f.a, { ...draft, createdByUserId: f.userA }),
      await repository.insert(f.b, { ...draft, createdByUserId: f.userB }),
    ];
    const contactA = randomUUID();
    await f.connection.pool.query(
      "insert into contacts(id,store_id,name,source,kind) values($1,$2,'রিনা','manual','customer')",
      [contactA, f.a],
    );
    await f.connection.pool.query("update campaigns set status='scheduled' where id=$1", [a.id]);
    await repository.insertRecipients(f.a, a.id, [
      {
        contactId: contactA,
        destinationAddress: '01711000001',
        status: 'queued',
        skipReason: null,
      },
    ]);
    const before = await f.row('campaigns', a.id);
    const now = new Date('2026-11-16T05:00:00Z');

    expect(await repository.lockScheduled(f.b, a.id)).toBeUndefined();
    expect(
      await f.tenant.forStore(f.b, () => repository.lockCampaign(f.b, a.id, 'update')),
    ).toBeUndefined();
    expect(
      await f.tenant.forStore(f.a, () => repository.lockCampaign(f.a, a.id, 'update')),
    ).toMatchObject({
      id: a.id,
      status: 'scheduled',
    });
    expect(
      await repository.changeStatus(
        f.b,
        a.id,
        { status: 'scheduled' },
        {
          status: 'cancelled',
          updatedAt: now,
        },
      ),
    ).toBeUndefined();
    await repository.cancelQueuedRecipients(f.b, a.id);
    await repository.removeRecipients(f.b, a.id);
    expect(
      await repository.changeStatus(
        f.b,
        b.id,
        { status: 'draft' },
        { status: 'cancelled', updatedAt: now },
      ),
    ).toMatchObject({ status: 'cancelled' });

    expect(await f.row('campaigns', a.id)).toEqual(before);
    const { rows } = await f.connection.pool.query(
      'select status from campaign_recipients where campaign_id=$1',
      [a.id],
    );
    expect(rows).toEqual([{ status: 'queued' }]);
    await f.connection.pool.query('delete from contacts where id=$1', [contactA]);
  });

  it('reads the pause reason of and resumes only the selected store’s campaigns', async () => {
    const a = await repository.insert(f.a, { ...draft, createdByUserId: f.userA });
    await f.connection.pool.query(
      "update campaigns set status='paused', pause_reason='manual' where id=$1",
      [a.id],
    );
    const before = await f.row('campaigns', a.id);
    const now = new Date('2026-11-16T05:00:00Z');

    expect(await repository.findPauseReason(f.b, a.id)).toBeNull();
    expect(await repository.findPauseReason(f.a, a.id)).toBe('manual');
    expect(
      await repository.changeStatus(
        f.b,
        a.id,
        { status: 'paused', pauseReason: 'manual' },
        { status: 'sending', pauseReason: null, updatedAt: now },
      ),
    ).toBeUndefined();
    expect(await f.row('campaigns', a.id)).toEqual(before);
  });

  it('starts, saves, counts, clears and fails only the selected store’s approvals', async () => {
    const a = await repository.insert(f.a, { ...draft, createdByUserId: f.userA });
    const contacts = [randomUUID(), randomUUID(), randomUUID()];
    for (const id of contacts)
      await f.connection.pool.query(
        "insert into contacts(id,store_id,name,source,kind) values($1,$2,'রিনা','manual','customer')",
        [id, f.a],
      );
    const approvedAt = new Date('2026-11-16T05:00:00Z');
    const later = new Date('2026-11-16T05:01:00Z');
    const start = {
      approvedByUserId: f.userA,
      approvedAt,
      updatedAt: approvedAt,
      approvalEstimatedTotal: 3,
    };

    expect(await approvals.markApproving(f.b, a.id, start)).toBeUndefined();
    expect(await approvals.markApproving(f.a, a.id, start)).toMatchObject({
      status: 'approving',
      approvalEstimatedTotal: 3,
    });
    expect(await approvals.markApproving(f.a, a.id, start)).toBeUndefined();
    await repository.insertRecipients(
      f.a,
      a.id,
      contacts.map((contactId, index) => ({
        contactId,
        destinationAddress: `0171000000${index}`,
        ...(index === 2
          ? { status: 'skipped', skipReason: 'no_consent' }
          : { status: 'queued', skipReason: null }),
      })),
    );

    const progress = { segmentIndex: 1, contactId: contacts[1]!, checkedCount: 2 };
    expect(await approvals.findApproval(f.b, { id: a.id, approvedAt: approvedAt })).toBeUndefined();
    expect(await approvals.findApproval(f.a, { id: a.id, approvedAt: later })).toBeUndefined();
    expect(await approvals.findApproval(f.a, { id: a.id, approvedAt: approvedAt })).toMatchObject({
      segmentIndex: 0,
      contactId: null,
    });
    expect(
      await approvals.saveApprovalProgress(
        f.b,
        { id: a.id, approvedAt: approvedAt },
        progress,
        later,
      ),
    ).toBe(false);
    expect(
      await approvals.saveApprovalProgress(f.a, { id: a.id, approvedAt: later }, progress, later),
    ).toBe(false);
    expect(
      await approvals.saveApprovalProgress(
        f.a,
        { id: a.id, approvedAt: approvedAt },
        progress,
        later,
      ),
    ).toBe(true);
    expect(await approvals.findApproval(f.a, { id: a.id, approvedAt: approvedAt })).toMatchObject({
      segmentIndex: 1,
      contactId: contacts[1],
      approvalCheckedCount: 2,
    });
    expect(await approvals.countFrozenRecipients(f.a, a.id)).toEqual({ queued: 2, skipped: 1 });
    expect(await approvals.countFrozenRecipients(f.b, a.id)).toEqual({ queued: 0, skipped: 0 });

    const before = await f.row('campaigns', a.id);
    expect(await approvals.removeRecipientsBatch(f.b, a.id, 2)).toBe(0);
    expect(
      await approvals.failApproval(
        f.b,
        { id: a.id, approvedAt: approvedAt },
        'CAMPAIGN_NO_RECIPIENTS',
        later,
      ),
    ).toBe(false);
    expect(await f.row('campaigns', a.id)).toEqual(before);
    expect(await approvals.removeRecipientsBatch(f.a, a.id, 2)).toBe(2);
    expect(await approvals.removeRecipientsBatch(f.a, a.id, 2)).toBe(1);
    expect(await approvals.removeRecipientsBatch(f.a, a.id, 2)).toBe(0);

    expect(
      await approvals.failApproval(
        f.a,
        { id: a.id, approvedAt: later },
        'CAMPAIGN_NO_RECIPIENTS',
        later,
      ),
    ).toBe(false);
    expect(
      await approvals.failApproval(
        f.a,
        { id: a.id, approvedAt: approvedAt },
        'WALLET_BALANCE_TOO_LOW',
        later,
      ),
    ).toBe(true);
    expect(await repository.find(f.a, a.id)).toMatchObject({
      status: 'draft',
      approvalFailureCode: 'WALLET_BALANCE_TOO_LOW',
      approvalCheckedCount: 0,
      approvalEstimatedTotal: 0,
    });
    expect(
      await approvals.markApproving(f.a, a.id, { ...start, approvedAt: later, updatedAt: later }),
    ).toMatchObject({
      status: 'approving',
      approvalFailureCode: null,
    });
    for (const id of contacts)
      await f.connection.pool.query('delete from contacts where id=$1', [id]);
  });
});
