import { Inject, Injectable } from '@nestjs/common';

import type { AuditEntry } from '@dakly/contracts/audit';
import {
  type AutomationDetailResponse,
  type AutomationListQuery,
  type AutomationListResponse,
  type AutomationPauseReason,
  type AutomationResponse,
  type AutomationStatus,
  type ChangeAutomationInput,
  type CreateAutomationInput,
  MAX_AUTOMATIONS_PER_STORE,
} from '@dakly/contracts/automations';
import { isTriggerReadyBeforeChannels } from '@dakly/contracts/automations/catalogue';
import {
  type AutomationGraph,
  type AutomationStep,
  nextStepKeys,
} from '@dakly/contracts/automations/graph';
import { automationTemplates } from '@dakly/contracts/automations/templates';
import type { campaignChannels } from '@dakly/contracts/campaigns';
import type { StoreAccess } from '@dakly/contracts/team';

import { NotificationsService } from '../notifications/notifications.service';
import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { DAY_MS } from '../platform/time';
import { StoresService } from '../stores/stores.service';
import { TeamService } from '../team/team.service';
import { WalletService } from '../wallets/wallet.service';
import { automationError } from './automations.errors';
import { type Automation, AutomationsRepository } from './automations.repository';

// Writes take the actor (services.md); nothing records it for automations yet.
type Actor = AuditEntry['actor'];
type Approver = { access: StoreAccess; actor: Actor };

// Feature 09 and state-machines.md. Disable on the list is pause; Delete is archive.
const STATUS_MOVES = {
  publish: { from: ['draft', 'active', 'paused'], to: 'active' },
  enable: { from: ['paused'], to: 'active' },
  pause: { from: ['active'], to: 'paused' },
  archive: { from: ['draft', 'active', 'paused'], to: 'archived' },
} as const satisfies Record<string, { from: readonly AutomationStatus[]; to: AutomationStatus }>;
type StatusMove = keyof typeof STATUS_MOVES;
// The Pause button records a manual pause; moving to active or archiving clears either reason.
const PAUSE_REASONS = {
  publish: { pauseReason: null },
  enable: { pauseReason: null },
  pause: { pauseReason: 'manual', hasBalanceResumeSendAllowance: false },
  archive: { pauseReason: null },
} as const satisfies Record<
  StatusMove,
  { pauseReason: AutomationPauseReason | null; hasBalanceResumeSendAllowance?: boolean }
>;

// An archived workflow is deleted for the shop; its versions stay for the runs on them.
const VISIBLE_STATUSES = ['draft', 'active', 'paused'] as const;

// MSG-1 sends SMS only. Messenger comes with CHN-2 and CHAT-2, WhatsApp with Q2.
const SENDABLE_CHANNELS: readonly (typeof campaignChannels)[number][] = ['sms'];
const MIN_WAIT_BEFORE_SPLIT_MINUTES = 2 * 60;

@Injectable()
export class AutomationsService {
  constructor(
    @Inject(AutomationsRepository) private readonly repository: AutomationsRepository,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(StoresService) private readonly stores: StoresService,
    @Inject(TeamService) private readonly team: TeamService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(WalletService) private readonly wallets: WalletService,
  ) {}

  async list(storeId: string, query: AutomationListQuery): Promise<AutomationListResponse> {
    const since = new Date(this.clock.now().getTime() - 30 * DAY_MS);
    const rows = await this.repository.list(storeId, VISIBLE_STATUSES, query, since);
    const items = rows
      .slice(0, query.limit)
      .map(({ publishedGraph, enteredLast30Days, ...row }) => {
        const graph = publishedGraph ?? row.graph;
        const steps = Object.values(graph.steps);
        const channels = [
          ...new Set(steps.flatMap((step) => (step.kind === 'send' ? step.channels : []))),
        ];
        return {
          ...toAutomationResponse(row),
          trigger: graph.trigger.key,
          stepCount: steps.length,
          channels,
          enteredLast30Days,
        };
      });
    return { items, nextCursor: rows.length > query.limit ? items.at(-1)!.id : null };
  }

  async get(storeId: string, automationId: string): Promise<AutomationDetailResponse> {
    const automation = await this.findVisible(storeId, automationId);
    const versions = await this.repository.listVersions(storeId, automationId);
    return {
      ...toAutomationResponse(automation),
      versions: versions.map((version) => ({
        ...version,
        publishedAt: version.publishedAt.toISOString(),
      })),
    };
  }

  // The store lock makes the 100-workflow limit hold under concurrent creates.
  async create(
    storeId: string,
    input: CreateAutomationInput,
    actor: Actor,
  ): Promise<AutomationResponse> {
    return this.transaction.runLocked(storeId, async () => {
      if (
        (await this.repository.countWithStatus(storeId, VISIBLE_STATUSES)) >=
        MAX_AUTOMATIONS_PER_STORE
      )
        throw automationError('AUTOMATION_LIMIT_REACHED');
      const draft =
        'templateKey' in input
          ? { ...input, graph: automationTemplates[input.templateKey].graph }
          : input;
      // The live trigger starts as the first draft's; only Publish changes it after that.
      const automation = await this.repository.insert(storeId, {
        ...draft,
        triggerType: draft.graph.trigger.key,
        createdByUserId: actor.kind === 'user' ? actor.userId : null,
      });
      return toAutomationResponse(automation);
    });
  }

  // The draft changes freely, also while a version is live; Publish copies it.
  async change(
    storeId: string,
    automationId: string,
    input: ChangeAutomationInput,
    _actor: Actor,
  ): Promise<AutomationResponse> {
    const automation = await this.repository.change(
      storeId,
      { id: automationId, from: VISIBLE_STATUSES },
      { ...input, updatedAt: this.clock.now() },
    );
    if (!automation) throw automationError('AUTOMATION_NOT_FOUND');
    return toAutomationResponse(automation);
  }

  // Runs already in the workflow keep the version they entered (feature 09).
  async publish(
    storeId: string,
    automationId: string,
    { access, actor }: Approver,
  ): Promise<AutomationResponse> {
    await this.checkCanApprove(storeId, access);
    return this.transaction.run(storeId, async () => {
      // The status update locks the row first, so a second publish or a draft edit waits, and
      // the checks run on the graph that is published. A refusal rolls the status back.
      const locked = await this.move(storeId, automationId, 'publish');
      checkPublishable(locked.graph);
      const now = this.clock.now();
      const version = await this.repository.insertVersion(storeId, automationId, {
        graph: locked.graph,
        publishedByUserId: actor.kind === 'user' ? actor.userId : null,
        publishedAt: now,
      });
      const published = await this.repository.change(
        storeId,
        { id: automationId, from: ['active'] },
        { publishedVersionId: version.id, triggerType: locked.graph.trigger.key, updatedAt: now },
      );
      return toAutomationResponse(published!);
    });
  }

  async enable(
    storeId: string,
    automationId: string,
    { access }: Approver,
  ): Promise<AutomationResponse> {
    await this.checkCanApprove(storeId, access);
    return this.move(storeId, automationId, 'enable');
  }

  pause(storeId: string, automationId: string, _actor: Actor): Promise<AutomationResponse> {
    return this.move(storeId, automationId, 'pause');
  }

  async archive(storeId: string, automationId: string, _actor: Actor): Promise<void> {
    await this.move(storeId, automationId, 'archive');
  }

  // "Stop the old version": runs still on it exit at their next step. The live version is
  // stopped by pausing the workflow instead.
  async stopVersion(
    storeId: string,
    automationId: string,
    versionId: string,
    _actor: Actor,
  ): Promise<void> {
    const automation = await this.findVisible(storeId, automationId);
    if (automation.publishedVersionId === versionId)
      throw automationError('AUTOMATION_VERSION_IS_CURRENT');
    if (!(await this.repository.stopVersion(storeId, automationId, versionId)))
      throw automationError('AUTOMATION_VERSION_NOT_FOUND');
  }

  // Inside the send step's transaction. Only the first run short of SMS credits pauses the
  // workflow and posts a card for the owner.
  async pauseForBalance(storeId: string, automationId: string): Promise<void> {
    const revision = await this.wallets.currentRevision(storeId, 'sms_credits');
    const now = await this.repository.schedulerTime(storeId);
    const paused = await this.repository.pauseForBalance(storeId, automationId, revision, now);
    if (!paused) return;
    await this.notifications.notify(storeId, {
      type: 'automation.paused_for_balance',
      category: 'fix_now',
      dedupeKey: `automation-balance:${automationId}:${revision}`,
      recipientPermission: 'billing.edit',
      ...balancePauseNotice(paused.name),
      actionUrl: TOP_UP_PATH,
    });
  }

  // A delayed credit event cannot resume a pause whose gate already saw that ledger revision.
  async resumeAfterTopUp(storeId: string, entryId: string): Promise<void> {
    await this.transaction.run(storeId, async () => {
      const revision = await this.wallets.topUpRevision(storeId, 'sms_credits', entryId);
      if (revision === undefined) return;
      const ids = await this.repository.lockBalancePaused(storeId, revision);
      if (ids.length === 0) return;
      const resumedAt = await this.repository.schedulerTime(storeId);
      await this.repository.resumeBalancePaused(storeId, ids, resumedAt);
    });
  }

  private async move(
    storeId: string,
    automationId: string,
    move: StatusMove,
  ): Promise<AutomationResponse> {
    const { from, to } = STATUS_MOVES[move];
    // Only a top-up ends a pause for a short balance (resumeAfterTopUp).
    const automation = await this.repository.change(
      storeId,
      { id: automationId, from },
      { status: to, ...PAUSE_REASONS[move], updatedAt: this.clock.now() },
      to === 'active' ? 'balance' : undefined,
    );
    if (automation) return toAutomationResponse(automation);
    const current = await this.findVisible(storeId, automationId);
    if (current.status === 'paused' && current.pauseReason === 'balance')
      throw automationError('AUTOMATION_PAUSED_BY_SYSTEM', [
        { path: 'pauseReason', message: 'balance' },
      ]);
    throw automationError('AUTOMATION_STATUS_NOT_ALLOWED');
  }

  // Publish and Enable let a workflow send (CAMP-R1), so the store's approval setting covers
  // them as it covers campaign approval.
  private async checkCanApprove(storeId: string, access: StoreAccess) {
    const { onlyOwnersAndAdminsApprove } = await this.stores.sendingSettings(storeId);
    if (onlyOwnersAndAdminsApprove && !this.team.canApproveSends(access))
      throw automationError('AUTOMATION_APPROVAL_DENIED');
  }

  private async findVisible(storeId: string, automationId: string): Promise<Automation> {
    const automation = await this.repository.find(storeId, automationId);
    if (!automation || automation.status === 'archived')
      throw automationError('AUTOMATION_NOT_FOUND');
    return automation;
  }
}

// The shop app has no top-up screen until PAY-8; Settings is where billing will live.
const TOP_UP_PATH = '/settings';
function balancePauseNotice(name: string) {
  return {
    title: `"${name}" paused: SMS balance too low`,
    body: `"${name}" paused because its next SMS needed more credits than were available. A top-up resumes the workflow and lets eligible messages go out.`,
  };
}

// The graph schema already refused a path with no end or a loop. These checks need to know what
// the store can use today.
function checkPublishable(graph: AutomationGraph) {
  checkRunnable(graph);
  if (!isTriggerReadyBeforeChannels(graph.trigger.key))
    throw automationError('AUTOMATION_TRIGGER_UNAVAILABLE', [
      { path: 'trigger.key', message: `${graph.trigger.key} is not available yet` },
    ]);
  for (const [key, step] of Object.entries(graph.steps)) {
    if (
      step.kind === 'send' &&
      !step.channels.some((channel) => SENDABLE_CHANNELS.includes(channel))
    )
      throw automationError('AUTOMATION_CHANNEL_UNREACHABLE', [
        { path: `steps.${key}`, message: 'No channel on this step can send yet' },
      ]);
    for (const sendKey of splitSendKeys(step))
      if (shortestWait(graph.steps, sendKey, key, new Map()) < MIN_WAIT_BEFORE_SPLIT_MINUTES)
        throw automationError('AUTOMATION_SPLIT_TOO_SOON', [
          { path: `steps.${key}`, message: `Less than 2 hours after ${sendKey}` },
        ]);
  }
}

type ActionKind = Extract<AutomationStep, { kind: 'action' }>['action']['action'];
// The runner's actions; the others wait for the feature that owns them.
const RUNNABLE_ACTIONS: readonly ActionKind[] = ['add_tag', 'remove_tag'];

// What the runner cannot do yet: taps on workflow messages are not recorded, the review list does
// not exist, and only tag actions have an owning service.
function checkRunnable({ goal, exitConditions, workflowFilters, steps }: AutomationGraph) {
  checkTapGoalsAndExits(goal, exitConditions);
  if (workflowFilters.some((filter) => filter.kind === 'tapped'))
    throw automationError('AUTOMATION_TAPS_UNAVAILABLE', [
      { path: 'workflowFilters', message: 'A tap filter is not available yet' },
    ]);
  for (const [key, step] of Object.entries(steps)) {
    const path = `steps.${key}`;
    if (
      step.kind === 'condition' &&
      step.paths.some(({ condition }) => condition.kind === 'tapped')
    )
      throw automationError('AUTOMATION_TAPS_UNAVAILABLE', [
        { path, message: 'A tap condition is not available yet' },
      ]);
    if (step.kind === 'send' && step.reviewBeforeSending)
      throw automationError('AUTOMATION_REVIEW_UNAVAILABLE', [
        { path, message: 'Review before sending is not available yet' },
      ]);
    if (step.kind === 'action' && !RUNNABLE_ACTIONS.includes(step.action.action))
      throw automationError('AUTOMATION_ACTION_UNAVAILABLE', [
        { path, message: `${step.action.action} is not available yet` },
      ]);
  }
}

function checkTapGoalsAndExits(
  goal: AutomationGraph['goal'],
  exitConditions: AutomationGraph['exitConditions'],
) {
  if (goal?.kind === 'tapped_link')
    throw automationError('AUTOMATION_TAPS_UNAVAILABLE', [
      { path: 'goal', message: 'A tap goal is not available yet' },
    ]);
  if (exitConditions.some((exit) => exit.kind === 'tapped_link'))
    throw automationError('AUTOMATION_TAPS_UNAVAILABLE', [
      { path: 'exitConditions', message: 'A tap exit is not available yet' },
    ]);
}

function splitSendKeys(step: AutomationStep): string[] {
  if (step.kind !== 'condition') return [];
  return step.paths.flatMap(({ condition }) =>
    condition.kind === 'tapped' || condition.kind === 'replied' ? [condition.stepKey] : [],
  );
}

// A wait for a time of day, a weekday or the window closing may end a minute later, so only a
// duration or an event timeout counts.
function guaranteedWait(step: AutomationStep): number {
  if (step.kind !== 'wait') return 0;
  if (step.wait.until === 'duration') return step.wait.minutes;
  if (step.wait.until === 'event') return step.wait.timeoutMinutes;
  return 0;
}

// The least wait on any path from one step to another, or Infinity when no path reaches it.
// The graph schema refuses loops, so the walk ends.
function shortestWait(
  steps: AutomationGraph['steps'],
  from: string,
  to: string,
  known: Map<string, number>,
): number {
  if (from === to) return 0;
  const cached = known.get(from);
  if (cached !== undefined) return cached;
  const step = steps[from]!;
  // An exit step has no next step, and Math.min() of nothing is Infinity.
  const after = Math.min(...nextStepKeys(step).map((next) => shortestWait(steps, next, to, known)));
  const total = guaranteedWait(step) + after;
  known.set(from, total);
  return total;
}

function toAutomationResponse(automation: Automation): AutomationResponse {
  return {
    ...automation,
    createdAt: automation.createdAt.toISOString(),
    updatedAt: automation.updatedAt.toISOString(),
  };
}
