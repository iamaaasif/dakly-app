import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';

import type {
  AutomationExitReason,
  AutomationRunStatus,
  AutomationStatus,
  AutomationStepKind,
} from '@dakly/contracts/automations';
import type { AutomationGraph, AutomationStep } from '@dakly/contracts/automations/graph';
import type { Database } from '@dakly/db/client';
import {
  automationRunSteps,
  automationRuns,
  automations,
  automationVersions,
} from '@dakly/db/schema/automations';

import { DATABASE } from '../platform/database/database.tokens';
import type { Transaction } from '../platform/database/scoped-transactions';
import { TenantDatabase } from '../platform/database/tenant-database';
import type { SkipReason } from '../sending/send-policy.service';
import { workflowSchedulerTime } from './workflow-scheduler-time.repository';

// A worker may change a run only while it holds this claim on this step.
export type RunClaim = { runId: string; stepKey: string; claimedAt: Date };
export type DueRun = RunClaim & { storeId: string };

export type ClaimedRun = {
  automationId: string;
  templateKey: string | null;
  contactId: string;
  triggerOrderId: string | null;
  status: AutomationRunStatus;
  currentStepKey: string;
  claimedAt: Date | null;
  wakeAt: Date | null;
  attempts: number;
  graph: AutomationGraph;
  isVersionStopped: boolean;
  automationStatus: AutomationStatus;
  balanceResumedAt: Date | null;
  hasBalanceResumeSendAllowance: boolean;
};

export type RunChange = {
  status: AutomationRunStatus;
  currentStepKey?: string;
  wakeAt?: Date;
  claimedAt?: Date;
  attempts?: number;
  exitReason?: AutomationExitReason;
  lastError?: string | null;
  finishedAt?: Date;
};

export type NewRunStep = {
  id?: string;
  stepKey: string;
  kind: AutomationStepKind;
  outcome: string;
  channel?: 'sms' | 'messenger' | 'instagram';
  category?: Extract<AutomationStep, { kind: 'send' }>['category'];
  optOutUrl?: string | null;
  renderedText?: string | null;
  destinationHash?: string | null;
  skipReason?: SkipReason;
  sentAt?: Date;
  firstTriedAt?: Date;
};
export type RunStepChange = {
  outcome: string;
  providerMessageId?: string;
  skipReason?: SkipReason;
  sentAt?: Date;
  firstTriedAt?: Date;
};
// A send handed to the provider whose outcome is not known yet.
export type SendingStep = {
  id: string;
  firstTriedAt: Date | null;
  latestDispatchAt: Date | null;
  optOutUrl: string | null;
  renderedText: string | null;
  destinationHash: string | null;
  providerMessageId: string | null;
  channel: string | null;
};

@Injectable()
export class AutomationRunsRepository {
  constructor(
    @Inject(TenantDatabase) private readonly database: TenantDatabase,
    @Inject(DATABASE) private readonly global: Database,
  ) {}

  attributionSources(storeId: string, contactId: string, ids: string[]) {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select({
          id: automationRunSteps.id,
          sourceId: automationRuns.automationId,
          channel: automationRunSteps.channel,
          sentAt: automationRunSteps.sentAt,
        })
        .from(automationRunSteps)
        .innerJoin(
          automationRuns,
          and(eq(automationRuns.storeId, storeId), eq(automationRuns.id, automationRunSteps.runId)),
        )
        .where(
          and(
            eq(automationRunSteps.storeId, storeId),
            eq(automationRunSteps.contactId, contactId),
            inArray(automationRunSteps.id, ids),
            eq(automationRunSteps.kind, 'send'),
            eq(automationRunSteps.category, 'marketing'),
            inArray(automationRunSteps.outcome, ['sent', 'delivered', 'read']),
          ),
        ),
    );
  }

  // Across stores through the SECURITY DEFINER function; each claim then runs inside its store.
  // A raw query returns timestamps as text.
  async claimDue(limit: number, perStore: number): Promise<DueRun[]> {
    const result = await this.global.execute<Omit<DueRun, 'claimedAt'> & { claimedAt: string }>(
      sql`select store_id as "storeId", automation_run_id as "runId", step_key as "stepKey",
        claimed_at as "claimedAt" from due_automation_runs(${limit}, ${perStore})`,
    );
    return result.rows.map((row) => ({ ...row, claimedAt: new Date(row.claimedAt) }));
  }

  // Lease and wake timestamps use the same clock as due_automation_runs.
  async schedulerTime(storeId: string): Promise<Date> {
    return this.database.forStore(storeId, workflowSchedulerTime);
  }

  async findRun(storeId: string, runId: string): Promise<ClaimedRun | undefined> {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .select({
          automationId: automationRuns.automationId,
          templateKey: automations.templateKey,
          contactId: automationRuns.contactId,
          triggerOrderId: automationRuns.triggerOrderId,
          status: automationRuns.status,
          currentStepKey: automationRuns.currentStepKey,
          claimedAt: automationRuns.claimedAt,
          wakeAt: automationRuns.wakeAt,
          attempts: automationRuns.attempts,
          graph: automationVersions.graph,
          isVersionStopped: automationVersions.isStopped,
          automationStatus: automations.status,
          balanceResumedAt: automations.balanceResumedAt,
          hasBalanceResumeSendAllowance: automations.hasBalanceResumeSendAllowance,
        })
        .from(automationRuns)
        .innerJoin(
          automationVersions,
          and(
            eq(automationVersions.storeId, automationRuns.storeId),
            eq(automationVersions.id, automationRuns.versionId),
          ),
        )
        .innerJoin(
          automations,
          and(
            eq(automations.storeId, automationRuns.storeId),
            eq(automations.id, automationRuns.automationId),
          ),
        )
        .where(and(eq(automationRuns.storeId, storeId), eq(automationRuns.id, runId)))
        .limit(1),
    );
    return row;
  }

  async lockConfirmationSend(storeId: string, stepId: string, contactId: string) {
    const [step] = await this.database.forStore(storeId, (tx) =>
      tx
        .select({
          orderId: automationRuns.triggerOrderId,
          runId: automationRuns.id,
          stepKey: automationRunSteps.stepKey,
          graph: automationVersions.graph,
          tappedAt: automationRunSteps.tappedAt,
        })
        .from(automationRunSteps)
        .innerJoin(
          automationRuns,
          and(eq(automationRuns.storeId, storeId), eq(automationRuns.id, automationRunSteps.runId)),
        )
        .innerJoin(
          automationVersions,
          and(
            eq(automationVersions.storeId, storeId),
            eq(automationVersions.id, automationRuns.versionId),
          ),
        )
        .innerJoin(
          automations,
          and(eq(automations.storeId, storeId), eq(automations.id, automationRuns.automationId)),
        )
        .where(
          and(
            eq(automationRunSteps.storeId, storeId),
            eq(automationRunSteps.id, stepId),
            eq(automationRunSteps.contactId, contactId),
            eq(automationRuns.contactId, contactId),
            eq(automations.templateKey, 'cod_order_confirmation'),
            eq(automationRunSteps.kind, 'send'),
            eq(automationRunSteps.channel, 'messenger'),
            inArray(automationRunSteps.outcome, [
              'sending',
              'sent',
              'delivered',
              'read',
              'unconfirmed',
            ]),
          ),
        )
        .for('update', { of: automationRunSteps }),
    );
    return step;
  }

  async recordConfirmationTap(storeId: string, stepId: string, tappedAt: Date): Promise<void> {
    await this.database.forStore(storeId, (tx) =>
      tx
        .update(automationRunSteps)
        .set({ tappedAt })
        .where(and(eq(automationRunSteps.storeId, storeId), eq(automationRunSteps.id, stepId))),
    );
  }

  async listTappedStepKeys(storeId: string, runId: string): Promise<string[]> {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .select({ stepKey: automationRunSteps.stepKey })
        .from(automationRunSteps)
        .where(
          and(
            eq(automationRunSteps.storeId, storeId),
            eq(automationRunSteps.runId, runId),
            isNotNull(automationRunSteps.tappedAt),
          ),
        ),
    );
    return rows.map((row) => row.stepKey);
  }

  async findSendingStep(
    storeId: string,
    runId: string,
    stepKey: string,
    lock = false,
  ): Promise<SendingStep | undefined> {
    const read = (tx: Transaction) => {
      const query = tx
        .select({
          id: automationRunSteps.id,
          firstTriedAt: automationRunSteps.firstTriedAt,
          latestDispatchAt: automationRunSteps.sentAt,
          optOutUrl: automationRunSteps.optOutUrl,
          renderedText: automationRunSteps.renderedText,
          destinationHash: automationRunSteps.destinationHash,
          providerMessageId: automationRunSteps.providerMessageId,
          channel: automationRunSteps.channel,
        })
        .from(automationRunSteps)
        .where(
          and(
            eq(automationRunSteps.storeId, storeId),
            eq(automationRunSteps.runId, runId),
            eq(automationRunSteps.stepKey, stepKey),
            eq(automationRunSteps.outcome, 'sending'),
          ),
        )
        .limit(1);
      return lock ? query.for('update') : query;
    };
    const [row] = lock
      ? await this.database.inTransaction(storeId, read)
      : await this.database.forStore(storeId, read);
    return row;
  }

  async changeStep(storeId: string, runId: string, stepKey: string, change: RunStepChange) {
    await this.database.forStore(storeId, (tx) =>
      tx
        .update(automationRunSteps)
        .set({
          ...change,
          ...(change.outcome !== 'sending' && {
            destinationHash: null,
            optOutUrl: null,
            renderedText: null,
          }),
        })
        .where(
          and(
            eq(automationRunSteps.storeId, storeId),
            eq(automationRunSteps.runId, runId),
            eq(automationRunSteps.stepKey, stepKey),
          ),
        ),
    );
  }

  // A step job counts its attempt once it holds the claim and starts, not when the sweep claims,
  // and renews the lease.
  async startWork(
    storeId: string,
    claim: RunClaim,
    claimedAt: Date,
  ): Promise<{ attempts: number; claimedAt: Date } | undefined> {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .update(automationRuns)
        .set({ attempts: sql`least(${automationRuns.attempts} + 1, 32767)`, claimedAt })
        .where(heldBy(storeId, claim))
        .returning({ attempts: automationRuns.attempts }),
    );
    return row && { attempts: row.attempts, claimedAt };
  }

  // As moveRun, and only while the workflow is active and the run's version is not stopped, read
  // in the same statement so a pause or stop that committed first is seen.
  async moveRunIfLive(
    storeId: string,
    claim: RunClaim,
    change: RunChange,
    gate?: 'first_send' | 'retry',
  ): Promise<boolean> {
    // A first send may write the pause itself. Both gates hold the workflow until their
    // dispatch commits so a pause and a new dispatch cannot pass each other.
    const lock = {
      first_send: sql`for no key update of ${automations} for share of ${automationVersions}`,
      retry: sql`for share of ${automations}, ${automationVersions}`,
    };
    const isLive = sql`exists (select 1 from ${automations} join ${automationVersions}
      on ${automationVersions.storeId} = ${automations.storeId}
      where ${automations.storeId} = ${automationRuns.storeId}
        and ${automations.id} = ${automationRuns.automationId}
        and ${automationVersions.id} = ${automationRuns.versionId}
        and ${automations.status} = 'active' and not ${automationVersions.isStopped}
      ${gate ? lock[gate] : sql.empty()})`;
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .update(automationRuns)
        .set(change)
        .where(and(heldBy(storeId, claim), isLive))
        .returning({ id: automationRuns.id }),
    );
    return rows.length > 0;
  }

  // Moves nothing when another worker has claimed the run since, or it left this step.
  async moveRun(storeId: string, claim: RunClaim, change: RunChange): Promise<boolean> {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .update(automationRuns)
        .set(change)
        .where(heldBy(storeId, claim))
        .returning({ id: automationRuns.id }),
    );
    return rows.length > 0;
  }

  async insertStep(storeId: string, runId: string, contactId: string, step: NewRunStep) {
    await this.database.forStore(storeId, (tx) =>
      tx.insert(automationRunSteps).values({ storeId, runId, contactId, ...step }),
    );
  }

  // Steps are kept 372 days after their run finishes (the attribution rebuild horizon).
  async purgeExpiredStepsBatch(storeId: string, limit: number): Promise<boolean> {
    const { rows } = await this.database.forStore(storeId, (tx) =>
      tx.execute<{ count: number }>(sql`
        with removed as (
          delete from automation_run_steps where ctid = any(array(
            select s.ctid from automation_run_steps s
            join automation_runs r on r.store_id = s.store_id and r.id = s.run_id
            where s.store_id = ${storeId} and r.finished_at < now() - interval '372 days'
            limit ${limit} for update of s skip locked))
          returning 1)
        select count(*)::int as count from removed`),
    );
    return rows[0]?.count === limit;
  }
}

// The run is still running on this step under this claim.
function heldBy(storeId: string, claim: RunClaim) {
  return and(
    eq(automationRuns.storeId, storeId),
    eq(automationRuns.id, claim.runId),
    eq(automationRuns.status, 'running'),
    eq(automationRuns.currentStepKey, claim.stepKey),
    eq(automationRuns.claimedAt, claim.claimedAt),
  );
}
