import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { automationTemplates } from '@dakly/contracts/automations/templates';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { AutomationsRepository } from './automations.repository';

const graph = automationTemplates.welcome_new_subscriber.graph;
const visible = ['draft', 'active', 'paused'] as const;
const now = new Date('2026-11-16T05:00:00Z');

describe('automation filters without RLS assistance', () => {
  const f = new OwnerIsolationFixture();
  const repository = new AutomationsRepository(f.tenant);
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
});
