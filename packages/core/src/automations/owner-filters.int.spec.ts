import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { automationTemplates } from '@dakly/contracts/automations/templates';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { AutomationRunsRepository } from './automation-runs.repository';
import { AutomationsRepository } from './automations.repository';

const graph = automationTemplates.welcome_new_subscriber.graph;
const visible = ['draft', 'active', 'paused'] as const;
const now = new Date('2026-11-16T05:00:00Z');

describe('automation filters without RLS assistance', () => {
  const f = new OwnerIsolationFixture();
  const repository = new AutomationsRepository(f.tenant);
  const runs = new AutomationRunsRepository(f.tenant, f.connection.db);
  beforeAll(() => f.setup());
  afterAll(() => f.close());

  async function published(storeId: string, userId: string) {
    const automation = await repository.insert(storeId, {
      name: 'নতুন গ্রাহককে স্বাগতম',
      graph,
      triggerType: 'consent_given',
      createdByUserId: userId,
    });
    const version = await repository.insertVersion(storeId, automation.id, {
      graph,
      publishedByUserId: userId,
      publishedAt: now,
    });
    return { automation, version };
  }

  it('saves into the selected store and reads and changes only its workflows', async () => {
    const a = await published(f.a, f.userA);
    const b = await published(f.b, f.userB);

    expect((await f.row('automations', b.automation.id)).store_id).toBe(f.b);
    expect((await f.row('automation_versions', b.version.id)).store_id).toBe(f.b);
    expect(b.version.version).toBe(1);
    expect(await repository.find(f.b, a.automation.id)).toBeUndefined();
    expect((await repository.list(f.b, visible, { limit: 100 })).map((row) => row.id)).toEqual([
      b.automation.id,
    ]);
    expect(await repository.countWithStatus(f.b, visible)).toBe(1);
    expect(await repository.listVersions(f.b, a.automation.id)).toEqual([]);

    expect(
      await repository.change(f.b, a.automation.id, visible, { name: 'চুরি', updatedAt: now }),
    ).toBeUndefined();
    expect(await repository.stopVersion(f.b, a.automation.id, a.version.id)).toBe(false);
    const fromStoreB = { graph, publishedByUserId: f.userB, publishedAt: now };
    await expect(repository.insertVersion(f.b, a.automation.id, fromStoreB)).rejects.toThrow();
    // A workflow with no version yet: the composite foreign key refuses it, not the unique index.
    const unpublished = await repository.insert(f.a, {
      name: 'জন্মদিনের শুভেচ্ছা',
      graph,
      triggerType: 'consent_given',
      createdByUserId: f.userA,
    });
    await expect(repository.insertVersion(f.b, unpublished.id, fromStoreB)).rejects.toThrow();
    const written = await f.connection.pool.query(
      'select id from automation_versions where automation_id=any($1::uuid[]) and store_id=$2',
      [[a.automation.id, unpublished.id], f.b],
    );
    expect(written.rows).toEqual([]);
    expect(await repository.listVersions(f.a, unpublished.id)).toEqual([]);
    expect(await repository.listVersions(f.a, a.automation.id)).toEqual([
      expect.objectContaining({ id: a.version.id, isStopped: false }),
    ]);
    expect(await repository.find(f.a, a.automation.id)).toMatchObject({ name: a.automation.name });
  });

  it('reads, moves and records runs only in the selected store', async () => {
    const a = await published(f.a, f.userA);
    const contactId = randomUUID();
    await f.connection.pool.query(
      "insert into contacts(id,store_id,name,source,kind) values($1,$2,'সুমি','manual','customer')",
      [contactId, f.a],
    );
    const runId = randomUUID();
    const claimedAt = new Date('2026-11-16T05:00:00.000Z');
    await f.connection.pool.query(
      "insert into automation_runs(id,store_id,automation_id,version_id,contact_id,trigger_key,current_step_key,status,claimed_at) values($1,$2,$3,$4,$5,'k','welcome','running',$6)",
      [runId, f.a, a.automation.id, a.version.id, contactId, claimedAt],
    );
    const claim = { runId, stepKey: 'welcome', claimedAt };
    const step = { stepKey: 'welcome', kind: 'wait', outcome: 'scheduled' } as const;

    expect(await runs.findRun(f.b, runId)).toBeUndefined();
    const renewedAt = new Date('2026-11-16T05:01:00.000Z');
    expect(await runs.startWork(f.b, claim, renewedAt)).toBeUndefined();
    expect((await f.row('automation_runs', runId)).attempts).toBe(0);
    // Renewing to the same time keeps the claim the rest of this test uses.
    expect(await runs.startWork(f.a, claim, claimedAt)).toEqual({ attempts: 1, claimedAt });
    expect(await runs.moveRun(f.b, claim, { status: 'done' })).toBe(false);
    expect(await runs.moveRunIfLive(f.b, claim, { status: 'done' })).toBe(false);
    await expect(runs.insertStep(f.b, runId, contactId, step)).rejects.toThrow();
    expect((await f.row('automation_runs', runId)).status).toBe('running');

    await runs.insertStep(f.a, runId, contactId, step);
    await f.connection.pool.query(
      'update automation_run_steps set tapped_at=now() where run_id=$1',
      [runId],
    );
    expect(await runs.listTappedStepKeys(f.b, runId)).toEqual([]);
    expect(await runs.listTappedStepKeys(f.a, runId)).toEqual(['welcome']);
    expect(await runs.findRun(f.a, runId)).toMatchObject({
      contactId,
      claimedAt,
      attempts: 1,
      graph,
    });
    const stepId = randomUUID();
    const sending = {
      id: stepId,
      stepKey: 'offer',
      kind: 'send',
      outcome: 'sending',
      sentAt: claimedAt,
    } as const;
    await runs.insertStep(f.a, runId, contactId, sending);
    expect(await runs.findSendingStep(f.b, runId, 'offer')).toBeUndefined();
    await runs.changeStep(f.b, runId, 'offer', { outcome: 'sent' });
    expect(await runs.findSendingStep(f.a, runId, 'offer')).toEqual({
      id: stepId,
      firstTriedAt: claimedAt,
      latestDispatchAt: claimedAt,
      optOutUrl: null,
      destinationHash: null,
    });
    const incompleteId = randomUUID();
    await runs.insertStep(f.a, runId, contactId, {
      id: incompleteId,
      stepKey: 'older-send',
      kind: 'send',
      outcome: 'sending',
    });
    expect(await runs.findSendingStep(f.a, runId, 'older-send')).toEqual({
      id: incompleteId,
      firstTriedAt: null,
      latestDispatchAt: null,
      optOutUrl: null,
      destinationHash: null,
    });
    await runs.changeStep(f.a, runId, 'offer', { outcome: 'sent' });
    expect(await runs.findSendingStep(f.a, runId, 'offer')).toBeUndefined();
    expect(await runs.moveRun(f.a, claim, { status: 'done' })).toBe(true);
  });
});
