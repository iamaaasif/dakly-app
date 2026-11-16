import { randomUUID } from 'node:crypto';

import { beforeEach, describe, expect, it } from 'vitest';

import type { CampaignStatus } from '@dakly/contracts/campaigns';

import type { Clock } from '../platform/clock';
import type { Campaign, CampaignsRepository } from './campaigns.repository';
import { CampaignsService } from './campaigns.service';

const STORE_ID = '7f1d3a52-4c55-4a8e-9a43-2a1f0c7d9b10';
const actor = { kind: 'user', userId: 'c5a0f0e4-0b55-4b7e-8d0e-6f3c3b7f1e21' } as const;
const now = new Date('2026-11-16T05:00:00Z');

// Keeps one store's campaigns in memory; change and delete touch only drafts, as the
// repository's guarded writes do.
class FakeCampaignsRepository {
  readonly rows = new Map<string, Campaign>();

  add(status: CampaignStatus, id = randomUUID()): Campaign {
    const row: Campaign = {
      id,
      name: 'ঈদের অফার',
      goal: 'seasonal',
      channel: 'sms',
      content: { text: 'ঈদে সব শাড়িতে ২০% ছাড়' },
      includeSegmentIds: [],
      excludeSegmentIds: [],
      scheduledFor: null,
      status,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(id, row);
    return row;
  }

  async list(_storeId: string, query: { limit: number }) {
    const newestFirst = [...this.rows.values()].sort((a, b) => b.id.localeCompare(a.id));
    return newestFirst.slice(0, query.limit + 1);
  }

  async find(_storeId: string, id: string) {
    return this.rows.get(id);
  }

  async changeDraft(_storeId: string, id: string, change: Partial<Campaign>) {
    const row = this.rows.get(id);
    if (row?.status !== 'draft') return undefined;
    const changed = { ...row, ...change };
    this.rows.set(id, changed);
    return changed;
  }

  async removeDraft(_storeId: string, id: string) {
    if (this.rows.get(id)?.status !== 'draft') return false;
    return this.rows.delete(id);
  }
}

describe('CampaignsService', () => {
  let repository: FakeCampaignsRepository;
  let service: CampaignsService;

  beforeEach(() => {
    repository = new FakeCampaignsRepository();
    service = new CampaignsService(
      repository as unknown as CampaignsRepository,
      { now: () => now } as Clock,
    );
  });

  it('gives a next cursor only when there is a row past the page', async () => {
    repository.add('draft', '00000000-0000-7000-8000-000000000001');
    repository.add('draft', '00000000-0000-7000-8000-000000000002');

    const full = await service.list(STORE_ID, { limit: 1 });
    expect(full.items.map((item) => item.id)).toEqual(['00000000-0000-7000-8000-000000000002']);
    expect(full.nextCursor).toBe('00000000-0000-7000-8000-000000000002');

    const last = await service.list(STORE_ID, { limit: 2 });
    expect(last.items).toHaveLength(2);
    expect(last.nextCursor).toBeNull();
  });

  it('reports a missing campaign as not found when changing it', async () => {
    await expect(
      service.changeDraft(STORE_ID, randomUUID(), { name: 'শীতের অফার' }, actor),
    ).rejects.toMatchObject({ code: 'CAMPAIGN_NOT_FOUND' });
  });

  it('refuses to change a campaign past draft and leaves it as it was', async () => {
    const campaign = repository.add('scheduled');
    await expect(
      service.changeDraft(STORE_ID, campaign.id, { name: 'শীতের অফার' }, actor),
    ).rejects.toMatchObject({ code: 'CAMPAIGN_NOT_DRAFT' });
    expect(repository.rows.get(campaign.id)?.name).toBe('ঈদের অফার');
  });

  it('reports a missing campaign as not found when deleting it', async () => {
    await expect(service.removeDraft(STORE_ID, randomUUID(), actor)).rejects.toMatchObject({
      code: 'CAMPAIGN_NOT_FOUND',
    });
  });

  it('refuses to delete a campaign past draft and keeps it', async () => {
    const campaign = repository.add('sending');
    await expect(service.removeDraft(STORE_ID, campaign.id, actor)).rejects.toMatchObject({
      code: 'CAMPAIGN_NOT_DRAFT',
    });
    expect(repository.rows.has(campaign.id)).toBe(true);
  });
});
