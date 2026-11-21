import { Inject, Injectable } from '@nestjs/common';

import type { KillSwitchFeature } from '@dakly/contracts/kill-switches';

import { Clock } from '../platform/clock';
import {
  KillSwitchesRepository,
  type KillSwitchChange,
  type KillSwitchRow,
} from './kill-switches.repository';

// Workers read switches on every job; a 30 second cache keeps a flip effective within a minute.
const CACHE_MS = 30_000;
export const KILL_SWITCH_RECHECK_MS = 60_000;

@Injectable()
export class KillSwitchesService {
  private cached: { rows: KillSwitchRow[]; loadedAt: number } | null = null;

  constructor(
    @Inject(KillSwitchesRepository) private readonly repository: KillSwitchesRepository,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async isPaused(feature: KillSwitchFeature, storeId: string): Promise<boolean> {
    const rows = await this.rows();
    return rows.some(
      (row) => row.feature === feature && (row.storeId === null || row.storeId === storeId),
    );
  }

  // A paused job waits and tries again, so queued work is kept, not dropped.
  async deferIfPaused(
    feature: KillSwitchFeature,
    storeId: string,
  ): Promise<{ delayUntil: number } | undefined> {
    if (!(await this.isPaused(feature, storeId))) return undefined;
    return { delayUntil: this.clock.now().getTime() + KILL_SWITCH_RECHECK_MS };
  }

  listActive(): Promise<KillSwitchRow[]> {
    return this.repository.list();
  }

  async change(input: KillSwitchChange): Promise<KillSwitchRow | null> {
    const row = await this.repository.change(input);
    this.cached = null;
    return row;
  }

  private async rows(): Promise<KillSwitchRow[]> {
    const now = this.clock.now().getTime();
    if (this.cached && now - this.cached.loadedAt < CACHE_MS) return this.cached.rows;
    const rows = await this.repository.list();
    this.cached = { rows, loadedAt: now };
    return rows;
  }
}
