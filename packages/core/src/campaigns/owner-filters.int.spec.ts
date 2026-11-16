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
});
