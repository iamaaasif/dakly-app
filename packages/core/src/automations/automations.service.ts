import { Inject, Injectable } from '@nestjs/common';

import type { AuditEntry } from '@dakly/contracts/audit';
import {
  type AutomationDetailResponse,
  type AutomationListQuery,
  type AutomationListResponse,
  type AutomationResponse,
  type AutomationStatus,
  type ChangeAutomationInput,
  type CreateAutomationInput,
  MAX_AUTOMATIONS_PER_STORE,
} from '@dakly/contracts/automations';
import { automationTriggers, type TriggerKey } from '@dakly/contracts/automations/catalogue';
import {
  type AutomationGraph,
  type AutomationStep,
  nextStepKeys,
} from '@dakly/contracts/automations/graph';
import type { campaignChannels } from '@dakly/contracts/campaigns';

import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { automationError } from './automations.errors';
import { type Automation, AutomationsRepository } from './automations.repository';

// Writes take the actor (services.md); nothing records it for automations yet.
type Actor = AuditEntry['actor'];

// Feature 09 and state-machines.md. Disable on the list is pause; Delete is archive.
const STATUS_MOVES = {
  publish: { from: ['draft', 'active', 'paused'], to: 'active' },
  enable: { from: ['paused'], to: 'active' },
  pause: { from: ['active'], to: 'paused' },
  archive: { from: ['draft', 'active', 'paused'], to: 'archived' },
} as const satisfies Record<string, { from: readonly AutomationStatus[]; to: AutomationStatus }>;
type StatusMove = keyof typeof STATUS_MOVES;

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
  ) {}

  async list(storeId: string, query: AutomationListQuery): Promise<AutomationListResponse> {
    const rows = await this.repository.list(storeId, VISIBLE_STATUSES, query);
    const items = rows.slice(0, query.limit).map(toAutomationResponse);
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
      // The live trigger starts as the first draft's; only Publish changes it after that.
      const automation = await this.repository.insert(storeId, {
        ...input,
        triggerType: input.graph.trigger.key,
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
    const automation = await this.repository.change(storeId, automationId, VISIBLE_STATUSES, {
      ...input,
      updatedAt: this.clock.now(),
    });
    if (!automation) throw automationError('AUTOMATION_NOT_FOUND');
    return toAutomationResponse(automation);
  }

  // Runs already in the workflow keep the version they entered (feature 09).
  async publish(storeId: string, automationId: string, actor: Actor): Promise<AutomationResponse> {
    return this.transaction.run(storeId, async () => {
      const automation = await this.findVisible(storeId, automationId);
      checkPublishable(automation.graph);
      // The status update locks the row first, so a second publish waits for this one. The live
      // trigger becomes the published graph's.
      await this.move(storeId, automationId, 'publish', automation.graph.trigger.key);
      const now = this.clock.now();
      const version = await this.repository.insertVersion(storeId, automationId, {
        graph: automation.graph,
        publishedByUserId: actor.kind === 'user' ? actor.userId : null,
        publishedAt: now,
      });
      const published = await this.repository.change(storeId, automationId, ['active'], {
        publishedVersionId: version.id,
        updatedAt: now,
      });
      return toAutomationResponse(published!);
    });
  }

  enable(storeId: string, automationId: string, _actor: Actor): Promise<AutomationResponse> {
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

  private async move(
    storeId: string,
    automationId: string,
    move: StatusMove,
    triggerType?: TriggerKey,
  ): Promise<AutomationResponse> {
    const { from, to } = STATUS_MOVES[move];
    const automation = await this.repository.change(storeId, automationId, from, {
      status: to,
      triggerType,
      updatedAt: this.clock.now(),
    });
    if (automation) return toAutomationResponse(automation);
    await this.findVisible(storeId, automationId);
    throw automationError('AUTOMATION_STATUS_NOT_ALLOWED');
  }

  private async findVisible(storeId: string, automationId: string): Promise<Automation> {
    const automation = await this.repository.find(storeId, automationId);
    if (!automation || automation.status === 'archived')
      throw automationError('AUTOMATION_NOT_FOUND');
    return automation;
  }
}

// The graph schema already refused a path with no end or a loop. These checks need to know what
// the store can use today.
function checkPublishable(graph: AutomationGraph) {
  if (!isTriggerAvailable(graph.trigger.key))
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

// Before channel connections (D40) a store has Dakly data and SMS only: a trigger ready before
// Channels needs nothing else (birthdays live on contacts), once some task emits its event.
function isTriggerAvailable(key: AutomationGraph['trigger']['key']): boolean {
  const trigger = automationTriggers[key];
  return trigger.availableBefore === 'channels' && !('plannedEvent' in trigger.source);
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
