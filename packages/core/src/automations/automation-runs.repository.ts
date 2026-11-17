import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';

import type {
  AutomationRunStatus,
  AutomationStatus,
  AutomationStepKind,
} from '@dakly/contracts/automations';
import type { AutomationGraph } from '@dakly/contracts/automations/graph';
import type { Database } from '@dakly/db/client';
import {
  automationRunSteps,
  automationRuns,
  automations,
  automationVersions,
} from '@dakly/db/schema/automations';

import { DATABASE } from '../platform/database/database.tokens';
import { TenantDatabase } from '../platform/database/tenant-database';

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

export type NewRunStep = { stepKey: string; kind: AutomationStepKind; outcome: string };

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
