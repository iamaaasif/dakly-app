import { randomUUID } from 'node:crypto';

import { beforeEach, describe, expect, it } from 'vitest';

import type { CampaignStatus } from '@dakly/contracts/campaigns';
import type { DaklyEvent } from '@dakly/contracts/events/dakly-event';
import type { StoreAccess } from '@dakly/contracts/team';

import type { Clock } from '../platform/clock';
import type { StoreTransaction } from '../platform/database/store-transaction';
import { AppError } from '../platform/errors/app-error';
import type { OutboxService } from '../platform/outbox/outbox.service';
import type { SegmentsService } from '../segments/segments.service';
import type {
  AudienceRequest,
  SendDecision,
  SendPolicyService,
} from '../sending/send-policy.service';
import type { StoresService } from '../stores/stores.service';
import { TeamService } from '../team/team.service';
import type { WalletService } from '../wallets/wallet.service';
import type {
  Campaign,
  CampaignApproval,
  CampaignsRepository,
  FrozenRecipient,
} from './campaigns.repository';
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

  readonly recipients: FrozenRecipient[] = [];

  async lockDraft(_storeId: string, id: string) {
    const row = this.rows.get(id);
    return row?.status === 'draft' ? row : undefined;
  }

  async insertRecipients(_storeId: string, _campaignId: string, recipients: FrozenRecipient[]) {
    this.recipients.push(...recipients);
  }

  async markApproved(_storeId: string, id: string, approval: CampaignApproval) {
    const row = this.rows.get(id);
    if (row?.status !== 'draft') return undefined;
    const changed = { ...row, ...approval };
    this.rows.set(id, changed);
    return changed;
  }
}

const access = (role: 'admin' | 'marketer'): StoreAccess => ({
  role,
  areas: { campaigns: 'edit' },
  seeFullPhone: false,
  exportLists: false,
  refund: false,
});
const marketer = access('marketer');
const admin = access('admin');

describe('CampaignsService', () => {
  let repository: FakeCampaignsRepository;
  let service: CampaignsService;
  // Segment members and the send gate's answer for each contact; a contact with no answer sends.
  let members: Map<string, string[]>;
  let decisions: Map<string, SendDecision>;
  let onlyOwnersAndAdminsApprove: boolean;
  let balance: number;
  let reserved: number[];
  let events: DaklyEvent[];

  beforeEach(() => {
    repository = new FakeCampaignsRepository();
    members = new Map();
    decisions = new Map();
    onlyOwnersAndAdminsApprove = true;
    balance = 1000;
    reserved = [];
    events = [];
    const segments = {
      contactIds: async (
        _storeId: string,
        segmentId: string,
        page: { cursor?: string; limit: number },
      ) => {
        const ids = members.get(segmentId) ?? [];
        const start = page.cursor ? ids.indexOf(page.cursor) + 1 : 0;
        return ids.slice(start, start + page.limit);
      },
    };
    const sendPolicy = {
      checkAudience: async (_storeId: string, request: AudienceRequest) =>
        request.contactIds.map((contactId) => ({
          contactId,
          phone: '01712345678',
          decision: decisions.get(contactId) ?? { action: 'send' },
        })),
    };
    const wallets = {
      reserve: async (_storeId: string, input: { quantity: number }) => {
        if (input.quantity > balance)
          throw new AppError('WALLET_BALANCE_TOO_LOW', { status: 409, message: 'Too low' });
        reserved.push(input.quantity);
        return { entryId: randomUUID(), balanceQuantity: balance - input.quantity };
      },
    };
    const stores = { sendingSettings: async () => ({ onlyOwnersAndAdminsApprove }) };
    service = new CampaignsService(
      repository as unknown as CampaignsRepository,
      segments as unknown as SegmentsService,
      sendPolicy as unknown as SendPolicyService,
      wallets as unknown as WalletService,
      stores as unknown as StoresService,
      new TeamService(undefined as never),
      { run: (_storeId: string, work: () => Promise<unknown>) => work() } as StoreTransaction,
      { publish: async (event: DaklyEvent) => void events.push(event) } as unknown as OutboxService,
      { now: () => now } as Clock,
    );
  });

  function approve(campaignId: string, access: StoreAccess = admin) {
    return service.approve(STORE_ID, campaignId, { access, actor });
  }

  // A draft to everyone in one segment but the second, with a two-part English message.
  function audienceDraft(count: number) {
    const ids = Array.from(
      { length: count },
      (_, index) => `00000000-0000-7000-8000-${String(index).padStart(12, '0')}`,
    );
    const campaign = repository.add('draft');
    campaign.includeSegmentIds = ['include'];
    campaign.excludeSegmentIds = ['exclude'];
    campaign.content = { text: 'a'.repeat(161) };
    members.set('include', ids);
    members.set('exclude', [ids[1]!]);
    return { campaign, ids };
  }

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

  it('estimates the audience across pages, minus exclusions and skips, in credits', async () => {
    const { campaign, ids } = audienceDraft(1203);
    decisions.set(ids[2]!, { action: 'skip', reason: 'no_consent' });
    decisions.set(ids[3]!, { action: 'skip', reason: 'no_consent' });
    decisions.set(ids[4]!, { action: 'skip', reason: 'frequency_cap' });
    decisions.set(ids[5]!, { action: 'defer', until: now });

    expect(await service.estimate(STORE_ID, campaign.id)).toEqual({
      audienceCount: 1202,
      skippedByReason: { no_consent: 2, frequency_cap: 1 },
      recipientsCount: 1199,
      smsParts: 2,
      smsCredits: 2398,
      costPoisha: 0,
    });
  });

  it('counts a contact in two include segments once', async () => {
    const { campaign, ids } = audienceDraft(3);
    campaign.includeSegmentIds = ['include', 'again'];
    members.set('again', [ids[0]!, ids[2]!]);

    expect((await service.estimate(STORE_ID, campaign.id)).audienceCount).toBe(2);
  });

  it('refuses an estimate for a campaign past draft', async () => {
    const campaign = repository.add('scheduled');

    await expect(service.estimate(STORE_ID, campaign.id)).rejects.toMatchObject({
      code: 'CAMPAIGN_NOT_DRAFT',
    });
  });

  it('freezes queued and skipped recipients, reserves the estimate and starts sending', async () => {
    const { campaign, ids } = audienceDraft(4);
    decisions.set(ids[2]!, { action: 'skip', reason: 'blocked' });
    const estimate = await service.estimate(STORE_ID, campaign.id);

    const approved = await approve(campaign.id);

    expect(approved.status).toBe('sending');
    expect(reserved).toEqual([estimate.smsCredits]);
    expect(repository.rows.get(campaign.id)).toMatchObject({ recipientsCount: 2, skippedCount: 1 });
    expect(
      repository.recipients.map((recipient) => [recipient.contactId, recipient.status]),
    ).toEqual([
      [ids[0], 'queued'],
      [ids[2], 'skipped'],
      [ids[3], 'queued'],
    ]);
    expect(repository.recipients[1]).toMatchObject({
      skipReason: 'blocked',
      destinationAddress: '01712345678',
    });
    expect(events).toEqual([
      expect.objectContaining({
        type: 'campaign.approved',
        payload: { campaignId: campaign.id, status: 'sending' },
      }),
    ]);
  });

  it.each([
    ['at the current moment', now],
    ['before it', new Date(now.getTime() - 60_000)],
  ])('refuses a send time %s', async (_case, scheduledFor) => {
    const { campaign } = audienceDraft(2);
    campaign.scheduledFor = scheduledFor;

    await expect(approve(campaign.id)).rejects.toMatchObject({ code: 'CAMPAIGN_SEND_TIME_PASSED' });
    expect(reserved).toEqual([]);
    expect(repository.rows.get(campaign.id)?.status).toBe('draft');
  });

  it('estimates no parts or credits for an empty message', async () => {
    const { campaign } = audienceDraft(2);
    campaign.content = { text: '' };

    expect(await service.estimate(STORE_ID, campaign.id)).toMatchObject({
      smsParts: 0,
      smsCredits: 0,
    });
  });

  it('schedules a campaign with a send time', async () => {
    const { campaign } = audienceDraft(2);
    campaign.scheduledFor = new Date('2026-11-20T06:00:00Z');

    expect((await approve(campaign.id)).status).toBe('scheduled');
  });

  it('refuses a Marketer while only owners and admins approve, and allows one when off', async () => {
    const { campaign } = audienceDraft(2);

    await expect(approve(campaign.id, marketer)).rejects.toMatchObject({
      code: 'CAMPAIGN_APPROVAL_DENIED',
      status: 403,
    });
    expect(repository.rows.get(campaign.id)?.status).toBe('draft');

    onlyOwnersAndAdminsApprove = false;
    expect((await approve(campaign.id, marketer)).status).toBe('sending');
  });

  it.each([
    [
      'CAMPAIGN_TEXT_EMPTY',
      'an empty message',
      (campaign: Campaign) => (campaign.content = { text: '' }),
    ],
    [
      'CAMPAIGN_NO_RECIPIENTS',
      'an audience no one can get',
      (campaign: Campaign) => (campaign.includeSegmentIds = []),
    ],
  ])('refuses %s for %s', async (code, _case, arrange) => {
    const { campaign } = audienceDraft(2);
    arrange(campaign);

    await expect(approve(campaign.id)).rejects.toMatchObject({ code });
    expect(reserved).toEqual([]);
  });

  it('refuses an approval the balance cannot cover', async () => {
    const { campaign } = audienceDraft(3);
    balance = 3;

    await expect(approve(campaign.id)).rejects.toMatchObject({ code: 'WALLET_BALANCE_TOO_LOW' });
    expect(repository.rows.get(campaign.id)?.status).toBe('draft');
    expect(events).toEqual([]);
  });

  it('refuses a second approval', async () => {
    const { campaign } = audienceDraft(2);
    await approve(campaign.id);

    await expect(approve(campaign.id)).rejects.toMatchObject({ code: 'CAMPAIGN_NOT_DRAFT' });
    expect(reserved).toHaveLength(1);
  });
});
