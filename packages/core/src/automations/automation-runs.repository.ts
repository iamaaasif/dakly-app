import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNotNull, sql } from 'drizzle-orm';

import type {
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
  contactId: string;
  status: AutomationRunStatus;
  currentStepKey: string;
  claimedAt: Date | null;
  wakeAt: Date | null;
  attempts: number;
  graph: AutomationGraph;
  isVersionStopped: boolean;
  automationStatus: AutomationStatus;
};

export type RunChange = {
  status: AutomationRunStatus;
  currentStepKey?: string;
  wakeAt?: Date;
  claimedAt?: Date;
  attempts?: number;
  exitReason?: string;
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
  skipReason?: SkipReason;
  sentAt?: Date;
};
export type RunStepChange = {
  outcome: string;
  providerMessageId?: string;
  skipReason?: SkipReason;
  sentAt?: Date;
};
// A send handed to the provider whose outcome is not known yet.
export type SendingStep = { sentAt: Date; optOutCode: string | null };

@Injectable()
export class AutomationRunsRepository {
  constructor(
    @Inject(TenantDatabase) private readonly database: TenantDatabase,
    @Inject(DATABASE) private readonly global: Database,
  ) {}

  // Across stores through the SECURITY DEFINER function; each claim then runs inside its store.
  // A raw query returns timestamps as text.
  async claimDue(limit: number): Promise<DueRun[]> {
    const result = await this.global.execute<Omit<DueRun, 'claimedAt'> & { claimedAt: string }>(
      sql`select store_id as "storeId", automation_run_id as "runId", step_key as "stepKey",
        claimed_at as "claimedAt" from due_automation_runs(${limit})`,
    );
    return result.rows.map((row) => ({ ...row, claimedAt: new Date(row.claimedAt) }));
  }

  async findRun(storeId: string, runId: string): Promise<ClaimedRun | undefined> {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .select({
          contactId: automationRuns.contactId,
          status: automationRuns.status,
          currentStepKey: automationRuns.currentStepKey,
          claimedAt: automationRuns.claimedAt,
          wakeAt: automationRuns.wakeAt,
          attempts: automationRuns.attempts,
          graph: automationVersions.graph,
          isVersionStopped: automationVersions.isStopped,
          automationStatus: automations.status,
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
        .select({ sentAt: automationRunSteps.sentAt, optOutCode: automationRunSteps.optOutCode })
        .from(automationRunSteps)
        .where(
          and(
            eq(automationRunSteps.storeId, storeId),
            eq(automationRunSteps.runId, runId),
            eq(automationRunSteps.stepKey, stepKey),
            eq(automationRunSteps.outcome, 'sending'),
            isNotNull(automationRunSteps.sentAt),
          ),
        )
        .limit(1),
    );
    // The where clause keeps only rows with a send time.
    return row && { sentAt: row.sentAt!, optOutCode: row.optOutCode };
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

  // Moves nothing when another worker has claimed the run since, or it left this step.
  async moveRun(storeId: string, claim: RunClaim, change: RunChange): Promise<boolean> {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .update(automationRuns)
        .set(change)
        .where(
          and(
            eq(automationRuns.storeId, storeId),
            eq(automationRuns.id, claim.runId),
            eq(automationRuns.status, 'running'),
            eq(automationRuns.currentStepKey, claim.stepKey),
            eq(automationRuns.claimedAt, claim.claimedAt),
          ),
        )
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
