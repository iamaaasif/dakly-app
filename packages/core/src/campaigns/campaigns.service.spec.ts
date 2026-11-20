import { randomUUID } from 'node:crypto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CampaignStatus } from '@dakly/contracts/campaigns';
import type { DaklyEvent } from '@dakly/contracts/events/dakly-event';
import type { StoreAccess } from '@dakly/contracts/team';

import type { AnalyticsService } from '../analytics/analytics.service';
import type { LinksService } from '../links/links.service';
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
  ApprovalKey,
  ApprovalProgress,
  ApprovalStart,
  CampaignApprovalRepository,
} from './campaign-approval.repository';
import { CampaignApprovalService } from './campaign-approval.service';
import { CampaignAudienceService } from './campaign-audience.service';
import { CampaignSmsService } from './campaign-sms.service';
import type {
  Campaign,
  CampaignApproval,
  CampaignsRepository,
  CampaignStatusChange,
  CampaignStatusGuard,
  FrozenRecipient,
} from './campaigns.repository';
import { CampaignsService } from './campaigns.service';

const STORE_ID = '7f1d3a52-4c55-4a8e-9a43-2a1f0c7d9b10';
const actor = { kind: 'user', userId: 'c5a0f0e4-0b55-4b7e-8d0e-6f3c3b7f1e21' } as const;
const now = new Date('2026-11-16T05:00:00Z');

// Keeps one store's campaigns in memory; change and delete touch only drafts, as the
// repository's guarded writes do.
class FakeCampaignsRepository {
  readonly rows = new Map<
    string,
    Campaign &
      Pick<CampaignStatusChange, 'pauseReason'> & {
        approvedAt?: Date | null;
        approvedByUserId?: string | null;
        segmentIndex?: number;
        contactId?: string | null;
      }
  >();

  add(
    status: CampaignStatus,
    id = randomUUID(),
    pauseReason?: CampaignStatusChange['pauseReason'],
  ): Campaign {
    const row: Campaign & Pick<CampaignStatusChange, 'pauseReason'> = {
      id,
      name: 'ঈদের অফার',
      goal: 'seasonal',
      channel: 'sms',
      content: { text: 'ঈদে সব শাড়িতে ২০% ছাড়' },
      includeSegmentIds: [],
      excludeSegmentIds: [],
      scheduledFor: null,
      status,
      approvalCheckedCount: 0,
      approvalEstimatedTotal: 0,
      approvalFailureCode: null,
      startedAt: null,
      finishedAt: null,
      recipientsCount: 0,
      skippedCount: 0,
      sentCount: 0,
      deliveredCount: 0,
      readCount: 0,
      tappedCount: 0,
      failedCount: 0,
      countsAt: null,
      createdAt: now,
      updatedAt: now,
      pauseReason,
    };
    this.rows.set(id, row);
    return row;
  }

  async findPauseReason(_storeId: string, id: string) {
    return this.rows.get(id)?.pauseReason ?? null;
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

  recipients: (FrozenRecipient & { campaignId: string })[] = [];

  async lockDraft(_storeId: string, id: string) {
    const row = this.rows.get(id);
    return row?.status === 'draft' ? row : undefined;
  }

  // As in the repository, the first row for a contact stands.
  async insertRecipients(_storeId: string, campaignId: string, recipients: FrozenRecipient[]) {
    const frozen = new Set(
      this.recipients.filter((row) => row.campaignId === campaignId).map((row) => row.contactId),
    );
    for (const recipient of recipients)
      if (!frozen.has(recipient.contactId)) {
        frozen.add(recipient.contactId);
        this.recipients.push({ ...recipient, campaignId });
      }
  }

  async lockScheduled(_storeId: string, id: string) {
    const row = this.rows.get(id);
    return row?.status === 'scheduled' ? (row as Campaign & { approvedAt: Date }) : undefined;
  }

  async lockCampaign(_storeId: string, id: string) {
    return this.rows.get(id);
  }

  async changeStatus(
    _storeId: string,
    id: string,
    from: CampaignStatusGuard,
    change: CampaignStatusChange,
  ) {
    const row = this.rows.get(id);
    if (row?.status !== from.status) return undefined;
    if (from.pauseReason && row.pauseReason !== from.pauseReason) return undefined;
    const changed = { ...row, ...change };
    this.rows.set(id, changed);
    return changed;
  }

  async removeRecipients(_storeId: string, campaignId: string) {
    this.recipients = this.recipients.filter((recipient) => recipient.campaignId !== campaignId);
  }

  async cancelQueuedRecipients(_storeId: string, campaignId: string) {
    for (const recipient of this.recipients)
      if (recipient.campaignId === campaignId && recipient.status === 'queued')
        Object.assign(recipient, { status: 'cancelled' });
  }

  async settlementTotals(_storeId: string, campaignId: string) {
    return {
      unsettled: this.recipients.filter(
        (row) => row.campaignId === campaignId && row.status === 'queued',
      ).length,
      chargedCredits: 0,
    };
  }

  async markSettled() {
    return true;
  }

  async markApproved(_storeId: string, id: string, approval: CampaignApproval) {
    const row = this.rows.get(id);
    if (row?.status !== 'approving') return undefined;
    const changed = { ...row, ...approval };
    this.rows.set(id, changed);
    return changed;
  }
}

// The approval job's writes, on the same in-memory campaigns, guarded as the repository's are.
class FakeApprovalRepository {
  constructor(private readonly campaigns: FakeCampaignsRepository) {}

  private approving({ id, approvedAt }: ApprovalKey) {
    const row = this.campaigns.rows.get(id);
    return row?.status === 'approving' && row.approvedAt?.getTime() === approvedAt.getTime()
      ? row
      : undefined;
  }

  async markApproving(_storeId: string, id: string, start: ApprovalStart) {
    const row = this.campaigns.rows.get(id);
    if (row?.status !== 'draft') return undefined;
    const changed = {
      ...row,
      ...start,
      status: 'approving' as const,
      segmentIndex: 0,
      contactId: null,
      approvalCheckedCount: 0,
      approvalFailureCode: null,
    };
    this.campaigns.rows.set(id, changed);
    return changed;
  }

  async findApproval(_storeId: string, approval: ApprovalKey) {
    const row = this.approving(approval);
    return (
      row && {
        ...row,
        segmentIndex: row.segmentIndex ?? 0,
        contactId: row.contactId ?? null,
        approvedByUserId: row.approvedByUserId ?? null,
      }
    );
  }

  async saveApprovalProgress(_storeId: string, approval: ApprovalKey, progress: ApprovalProgress) {
    const row = this.approving(approval);
    if (!row) return false;
    Object.assign(row, {
      segmentIndex: progress.segmentIndex,
      contactId: progress.contactId,
      approvalCheckedCount: progress.checkedCount,
    });
    return true;
  }

  async markApprovalFailing(_storeId: string, approval: ApprovalKey, code: never) {
    const row = this.approving(approval);
    if (row) row.approvalFailureCode = code;
  }

  async countFrozenRecipients(_storeId: string, campaignId: string) {
    const rows = this.campaigns.recipients.filter((row) => row.campaignId === campaignId);
    return {
      queued: rows.filter((row) => row.status === 'queued').length,
      skipped: rows.filter((row) => row.status === 'skipped').length,
    };
  }

  async removeRecipientsBatch(_storeId: string, campaignId: string, limit: number) {
    const gone = this.campaigns.recipients
      .filter((row) => row.campaignId === campaignId)
      .slice(0, limit);
    this.campaigns.recipients = this.campaigns.recipients.filter((row) => !gone.includes(row));
    return gone.length;
  }

  async failApproval(_storeId: string, approval: ApprovalKey, code: never) {
    const row = this.approving(approval);
    if (!row) return false;
    Object.assign(row, {
      status: 'draft',
      approvedAt: null,
      approvalCheckedCount: 0,
      approvalEstimatedTotal: 0,
      approvalFailureCode: code,
    });
    return true;
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
  let approvals: CampaignApprovalService;
  // Segment members and the send gate's answer for each contact; a contact with no answer sends.
  let members: Map<string, string[]>;
  let decisions: Map<string, SendDecision>;
  let onlyOwnersAndAdminsApprove: boolean;
  let balance: number;
  let reserved: number[];
  let reservations: Map<string, { entryId: string; quantity: number; released: boolean }>;
  let clockNow: Date;
  let events: DaklyEvent[];

  beforeEach(() => {
    repository = new FakeCampaignsRepository();
    members = new Map();
    decisions = new Map();
    onlyOwnersAndAdminsApprove = true;
    balance = 1000;
    reserved = [];
    reservations = new Map();
    clockNow = now;
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
      matchingContactIds: async (_storeId: string, segmentId: string, contactIds: string[]) =>
        contactIds.filter((contactId) => members.get(segmentId)?.includes(contactId)),
      contactCount: async (_storeId: string, segmentId: string) =>
        members.get(segmentId)?.length ?? 0,
      assertExists: async () => undefined,
    };
    const sendPolicy = {
      checkAudience: async (_storeId: string, request: AudienceRequest) =>
        request.contactIds.map((contactId) => ({
          contactId,
          phone: '01712345678',
          decision: decisions.get(contactId) ?? { action: 'send' },
        })),
    };
    // Keys behave as in the ledger: a repeated key replays and a reservation releases once.
    const wallets = {
      reserve: async (_storeId: string, input: { quantity: number; idempotencyKey: string }) => {
        const replay = reservations.get(input.idempotencyKey);
        if (replay) return { entryId: replay.entryId, balanceQuantity: balance };
        if (input.quantity > balance)
          throw new AppError('WALLET_BALANCE_TOO_LOW', { status: 409, message: 'Too low' });
        reserved.push(input.quantity);
        balance -= input.quantity;
        const entryId = randomUUID();
        reservations.set(input.idempotencyKey, {
          entryId,
          quantity: input.quantity,
          released: false,
        });
        return { entryId, balanceQuantity: balance };
      },
      findByIdempotencyKey: async (_storeId: string, key: string) => {
        const reservation = reservations.get(key);
        return reservation && { entryId: reservation.entryId, balanceQuantity: balance };
      },
      reservationFor: async (_storeId: string, _wallet: string, key: string) => {
        const reservation = reservations.get(key);
        if (!reservation) throw new Error('Test reservation not found');
        return { entryId: reservation.entryId, quantity: reservation.quantity };
      },
      release: async (_storeId: string, input: { reservationId: string }) => {
        const reservation = [...reservations.values()].find(
          (entry) => entry.entryId === input.reservationId,
        );
        if (!reservation || reservation.released)
          throw new AppError('WALLET_RESERVATION_SETTLED', { status: 409, message: 'Settled' });
        reservation.released = true;
        balance += reservation.quantity;
        return { entryId: randomUUID(), balanceQuantity: balance };
      },
    };
    const stores = { sendingSettings: async () => ({ onlyOwnersAndAdminsApprove }) };
    const approvalRepository = new FakeApprovalRepository(repository);
    const transaction = {
      run: (_storeId: string, work: () => Promise<unknown>) => work(),
    } as StoreTransaction;
    const outbox = {
      publish: async (event: DaklyEvent) => void events.push(event),
    } as unknown as OutboxService;
    const sms = new CampaignSmsService({
      shortLinkBase: () => 'http://localhost:4000/l',
      sampleOptOutUrl: () => 'http://localhost:4000/l/s/00000000',
      sampleRedirectUrl: () => 'http://localhost:4000/l/00000000',
    } as LinksService);
    const clock = { now: () => clockNow } as Clock;
    const audience = new CampaignAudienceService(
      segments as unknown as SegmentsService,
      sendPolicy as unknown as SendPolicyService,
    );
    approvals = new CampaignApprovalService(
      approvalRepository as unknown as CampaignApprovalRepository,
      repository as unknown as CampaignsRepository,
      audience,
      sms,
      wallets as unknown as WalletService,
      outbox,
      transaction,
      clock,
    );
    service = new CampaignsService(
      repository as unknown as CampaignsRepository,
      {} as CampaignMessageTotalsRepository,
      segments as unknown as SegmentsService,
      audience,
      approvalRepository as unknown as CampaignApprovalRepository,
      wallets as unknown as WalletService,
      stores as unknown as StoresService,
      new TeamService(undefined as never),
      transaction,
      outbox,
      sms,
      clock,
      { campaignAttribution: async () => ({}) } as unknown as AnalyticsService,
    );
  });

  // The request, then the job to its end: the batch loop yields when its time is up.
  async function approve(campaignId: string, access: StoreAccess = admin) {
    const started = await service.approve(STORE_ID, campaignId, { access, actor });
    expect(started.status).toBe('approving');
    const key = { id: campaignId, approvedAt: repository.rows.get(campaignId)!.approvedAt! };
    while (await approvals.build(STORE_ID, key));
    return service.get(STORE_ID, campaignId);
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

  it('counts the opt-out link, so 150 characters that fit one part take two', async () => {
    const { campaign } = audienceDraft(3);
    campaign.content = { text: 'a'.repeat(150) };

    expect(await service.estimate(STORE_ID, campaign.id)).toMatchObject({
      recipientsCount: 2,
      smsParts: 2,
      smsCredits: 4,
    });
  });

  it('estimates the audience across pages, minus exclusions and skips, in credits', async () => {
    const { campaign, ids } = audienceDraft(1203);
    decisions.set(ids[2]!, { action: 'skip', reason: 'no_consent' });
    decisions.set(ids[3]!, { action: 'skip', reason: 'no_consent' });
    decisions.set(ids[4]!, { action: 'skip', reason: 'frequency_cap' });
    decisions.set(ids[5]!, { action: 'defer', until: now });

    expect(await service.estimate(STORE_ID, campaign.id)).toEqual({
      isComplete: true,
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
        type: 'campaign.approval_started',
        payload: { campaignId: campaign.id, approvedAt: now.toISOString() },
      }),
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

  it('returns the draft with the reason when the balance cannot cover the approval', async () => {
    const { campaign } = audienceDraft(3);
    balance = 3;

    const draft = await approve(campaign.id);

    expect(draft).toMatchObject({
      status: 'draft',
      approval: null,
      approvalFailureCode: 'WALLET_BALANCE_TOO_LOW',
    });
    expect(repository.recipients).toEqual([]);
    expect(reserved).toEqual([]);
    expect(events.map(({ type }) => type)).toEqual(['campaign.approval_started']);
  });

  it('returns the draft with the reason when no one in the audience can get the message', async () => {
    const { campaign, ids } = audienceDraft(3);
    for (const id of ids) decisions.set(id, { action: 'skip', reason: 'no_consent' });

    expect(await approve(campaign.id)).toMatchObject({
      status: 'draft',
      approvalFailureCode: 'CAMPAIGN_NO_RECIPIENTS',
    });
    expect(repository.recipients).toEqual([]);
  });

  it('returns the draft with the reason when the send time passes while the job runs', async () => {
    const { campaign } = audienceDraft(2);
    campaign.scheduledFor = new Date(now.getTime() + 60_000);
    await service.approve(STORE_ID, campaign.id, { access: admin, actor });
    clockNow = new Date(now.getTime() + 2 * 60_000);

    await approvals.build(STORE_ID, { id: campaign.id, approvedAt: now });

    expect(repository.rows.get(campaign.id)).toMatchObject({
      status: 'draft',
      approvalFailureCode: 'CAMPAIGN_SEND_TIME_PASSED',
    });
    expect(reserved).toEqual([]);
  });

  it('refuses a second approval', async () => {
    const { campaign } = audienceDraft(2);
    await approve(campaign.id);

    await expect(approve(campaign.id)).rejects.toMatchObject({ code: 'CAMPAIGN_NOT_DRAFT' });
    expect(reserved).toHaveLength(1);
  });

  // Approved for a send ten minutes from now, then the clock moves to `beforeSend` minutes ahead.
  async function scheduled(beforeSend: number) {
    const { campaign, ids } = audienceDraft(3);
    campaign.scheduledFor = new Date(now.getTime() + 10 * 60_000);
    decisions.set(ids[2]!, { action: 'skip', reason: 'no_consent' });
    await approve(campaign.id);
    clockNow = new Date(campaign.scheduledFor.getTime() - beforeSend * 60_000);
    return campaign;
  }

  it('refuses to unschedule 4 minutes before the send and keeps the credits reserved', async () => {
    const campaign = await scheduled(4);

    await expect(service.unschedule(STORE_ID, campaign.id, actor)).rejects.toMatchObject({
      code: 'CAMPAIGN_CHANGE_TOO_LATE',
      status: 409,
    });
    expect(repository.rows.get(campaign.id)?.status).toBe('scheduled');
    expect(balance).toBe(998);
    expect(repository.recipients).toHaveLength(2);
  });

  it.each([6, 5, 4])(
    'cancels %i minutes before the send, cancels the queued recipients and releases the credits',
    async (beforeSend) => {
      const campaign = await scheduled(beforeSend);

      expect((await service.cancel(STORE_ID, campaign.id, actor)).status).toBe('cancelled');
      expect(repository.rows.get(campaign.id)?.finishedAt).toEqual(clockNow);
      expect(balance).toBe(1000);
      expect(repository.recipients.map((recipient) => recipient.status)).toEqual([
        'cancelled',
        'skipped',
      ]);
    },
  );

  it('returns a scheduled campaign to draft and approves it again with a new reservation', async () => {
    const campaign = await scheduled(6);

    const draft = await service.unschedule(STORE_ID, campaign.id, actor);

    expect(draft.status).toBe('draft');
    expect(balance).toBe(1000);
    expect(repository.recipients).toEqual([]);
    expect(repository.rows.get(campaign.id)).toMatchObject({
      approvedAt: null,
      approvedByUserId: null,
      recipientsCount: 0,
      skippedCount: 0,
    });

    expect((await approve(campaign.id)).status).toBe('scheduled');
    expect(reserved).toEqual([2, 2]);
    expect(balance).toBe(998);
    expect(repository.recipients).toHaveLength(2);
  });

  it('keeps the reservation when the cancellation settlement is already stamped', async () => {
    const campaign = await scheduled(6);
    const stamp = vi.spyOn(repository, 'markSettled').mockResolvedValue(false);

    await expect(service.cancel(STORE_ID, campaign.id, actor)).resolves.toMatchObject({
      status: 'cancelled',
    });
    expect(stamp).toHaveBeenCalledOnce();
    expect(balance).toBe(998);
  });

  it('refuses to unschedule a campaign that is already sending', async () => {
    const campaign = repository.add('sending');

    await expect(service.unschedule(STORE_ID, campaign.id, actor)).rejects.toMatchObject({
      code: 'CAMPAIGN_NOT_SCHEDULED',
    });
    await expect(service.unschedule(STORE_ID, randomUUID(), actor)).rejects.toMatchObject({
      code: 'CAMPAIGN_NOT_FOUND',
    });
    expect(repository.rows.get(campaign.id)?.status).toBe('sending');
  });

  it.each(['cancelled', 'sent', 'failed'] as const)(
    'refuses to cancel a %s campaign',
    async (status) => {
      const campaign = repository.add(status);

      await expect(service.cancel(STORE_ID, campaign.id, actor)).rejects.toMatchObject({
        code: 'CAMPAIGN_NOT_CANCELLABLE',
        status: 409,
      });
      await expect(service.cancel(STORE_ID, randomUUID(), actor)).rejects.toMatchObject({
        code: 'CAMPAIGN_NOT_FOUND',
      });
      expect(repository.rows.get(campaign.id)?.status).toBe(status);
    },
  );

  it('pauses a sending campaign by hand and resumes it', async () => {
    const campaign = repository.add('sending');

    expect((await service.pause(STORE_ID, campaign.id, actor)).status).toBe('paused');
    expect(repository.rows.get(campaign.id)).toMatchObject({ pauseReason: 'manual' });

    expect((await service.resume(STORE_ID, campaign.id, actor)).status).toBe('sending');
    expect(repository.rows.get(campaign.id)).toMatchObject({ pauseReason: null });
  });

  it.each(['draft', 'scheduled', 'paused', 'sent', 'cancelled'] as const)(
    'refuses to pause a %s campaign',
    async (status) => {
      const campaign = repository.add(status);

      await expect(service.pause(STORE_ID, campaign.id, actor)).rejects.toMatchObject({
        code: 'CAMPAIGN_NOT_SENDING',
      });
      expect(repository.rows.get(campaign.id)?.status).toBe(status);
    },
  );

  it.each(['balance', 'whatsapp_quality', 'template_rejected', 'provider_error'] as const)(
    'refuses to resume by hand a campaign paused for %s and names the reason',
    async (reason) => {
      const campaign = repository.add('paused', randomUUID(), reason);

      await expect(service.resume(STORE_ID, campaign.id, actor)).rejects.toMatchObject({
        code: 'CAMPAIGN_PAUSED_BY_SYSTEM',
        status: 409,
        fields: [{ path: 'pauseReason', message: reason }],
      });
      expect(repository.rows.get(campaign.id)).toMatchObject({
        status: 'paused',
        pauseReason: reason,
      });
    },
  );

  it.each(['draft', 'scheduled', 'sending', 'sent', 'cancelled'] as const)(
    'refuses to resume a %s campaign',
    async (status) => {
      const campaign = repository.add(status);

      await expect(service.resume(STORE_ID, campaign.id, actor)).rejects.toMatchObject({
        code: 'CAMPAIGN_NOT_PAUSED',
      });
      expect(repository.rows.get(campaign.id)?.status).toBe(status);
    },
  );

  it('stops the estimate at 20,000 contacts and says it is not complete', async () => {
    // One of the ids is excluded, so 19,999 are checked from the first 20,000 read.
    const { campaign, ids } = audienceDraft(20_002);
    decisions.set(ids[0]!, { action: 'skip', reason: 'no_consent' });

    expect(await service.estimate(STORE_ID, campaign.id)).toMatchObject({
      isComplete: false,
      audienceCount: 19_999,
      recipientsCount: 19_998,
    });
  });

  it('reports an estimate as complete when the whole audience was read', async () => {
    const { campaign } = audienceDraft(3);

    expect(await service.estimate(STORE_ID, campaign.id)).toMatchObject({
      isComplete: true,
      audienceCount: 2,
    });
  });

  it('approves an audience over 20,000 with every contact frozen', async () => {
    const { campaign, ids } = audienceDraft(20_002);
    decisions.set(ids[0]!, { action: 'skip', reason: 'no_consent' });
    balance = 100_000;

    const approved = await approve(campaign.id);

    expect(approved).toMatchObject({
      status: 'sending',
      counts: { recipients: 20_000, skipped: 1 },
    });
    expect(repository.recipients).toHaveLength(20_001);
  });
});
