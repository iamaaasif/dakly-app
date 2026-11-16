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

  async function saved(storeId: string, userId: string) {
    const automation = await repository.insert(storeId, {
      name: 'নতুন গ্রাহককে স্বাগতম',
      graph,
      triggerType: 'consent_given',
      createdByUserId: userId,
    });
    return { automation };
  }

  it('saves into the selected store and reads and changes only its workflows', async () => {
    const a = await saved(f.a, f.userA);
    const b = await saved(f.b, f.userB);

    expect((await f.row('automations', b.automation.id)).store_id).toBe(f.b);
    expect(await repository.find(f.b, a.automation.id)).toBeUndefined();
    expect((await repository.list(f.b, visible, { limit: 100 })).map((row) => row.id)).toEqual([
      b.automation.id,
    ]);
    expect(await repository.countWithStatus(f.b, visible)).toBe(1);

    expect(
      await repository.change(f.b, a.automation.id, visible, { name: 'চুরি', updatedAt: now }),
    ).toBeUndefined();
    expect(await repository.find(f.a, a.automation.id)).toMatchObject({ name: a.automation.name });
  });
});
