import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNotNull, sql } from 'drizzle-orm';

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
import { TenantDatabase } from '../platform/database/tenant-database';
import type { SkipReason } from '../sending/send-policy.service';

// A worker may change a run only while it holds this claim on this step.
export type RunClaim = { runId: string; stepKey: string; claimedAt: Date };
export type DueRun = RunClaim & { storeId: string };

export type ClaimedRun = {
  automationId: string;
  contactId: string;
  status: AutomationRunStatus;
  currentStepKey: string;
  claimedAt: Date | null;
  wakeAt: Date | null;
  attempts: number;
  graph: AutomationGraph;
  isVersionStopped: boolean;
  automationStatus: AutomationStatus;
  balanceResumedAt: Date | null;
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
  channel?: 'sms';
  category?: Extract<AutomationStep, { kind: 'send' }>['category'];
  optOutCode?: string | null;
  destination?: string | null;
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
  firstTriedAt: Date;
  optOutCode: string | null;
  destination: string | null;
};

@Injectable()
export class AutomationRunsRepository {
  constructor(
    @Inject(TenantDatabase) private readonly database: TenantDatabase,
    @Inject(DATABASE) private readonly global: Database,
  ) {}

  // Across stores through the SECURITY DEFINER function; each claim then runs inside its store.
  // A raw query returns timestamps as text.
  async claimDue(limit: number, perStore: number): Promise<DueRun[]> {
    const result = await this.global.execute<Omit<DueRun, 'claimedAt'> & { claimedAt: string }>(
      sql`select store_id as "storeId", automation_run_id as "runId", step_key as "stepKey",
        claimed_at as "claimedAt" from due_automation_runs(${limit}, ${perStore})`,
    );
    return result.rows.map((row) => ({ ...row, claimedAt: new Date(row.claimedAt) }));
  }

  async findRun(storeId: string, runId: string): Promise<ClaimedRun | undefined> {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .select({
          automationId: automationRuns.automationId,
          contactId: automationRuns.contactId,
          status: automationRuns.status,
          currentStepKey: automationRuns.currentStepKey,
          claimedAt: automationRuns.claimedAt,
          wakeAt: automationRuns.wakeAt,
          attempts: automationRuns.attempts,
          graph: automationVersions.graph,
          isVersionStopped: automationVersions.isStopped,
          automationStatus: automations.status,
          balanceResumedAt: automations.balanceResumedAt,
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
  ): Promise<SendingStep | undefined> {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .select({
          id: automationRunSteps.id,
          firstTriedAt: automationRunSteps.firstTriedAt,
          sentAt: automationRunSteps.sentAt,
          optOutCode: automationRunSteps.optOutCode,
          destination: automationRunSteps.destination,
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
        .limit(1),
    );
    if (!row) return undefined;
    const firstTriedAt = row.firstTriedAt ?? row.sentAt;
    return firstTriedAt ? { ...row, firstTriedAt } : undefined;
  }

  async changeStep(storeId: string, runId: string, stepKey: string, change: RunStepChange) {
    await this.database.forStore(storeId, (tx) =>
      tx
        .update(automationRunSteps)
        .set(change)
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
  async moveRunIfLive(storeId: string, claim: RunClaim, change: RunChange): Promise<boolean> {
    const isLive = sql`exists (select 1 from ${automations} join ${automationVersions}
      on ${automationVersions.storeId} = ${automations.storeId}
      where ${automations.storeId} = ${automationRuns.storeId}
        and ${automations.id} = ${automationRuns.automationId}
        and ${automationVersions.id} = ${automationRuns.versionId}
        and ${automations.status} = 'active' and not ${automationVersions.isStopped})`;
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
