import { Inject, Injectable } from '@nestjs/common';

import { Clock } from '../platform/clock';
import { DAY_MS, HOUR_MS } from '../platform/time';
import { StoresService } from '../stores/stores.service';
import { MaintenanceRollupsRepository, type Rollup } from './maintenance-rollups.repository';
import { maintenanceError } from './maintenance.errors';

const MONTHS_AHEAD = 3;
const STORE_PAGE_SIZE = 100;
// A long outage catches up over several nights instead of one very long run.
const MAX_DAYS_PER_RUN = 31;
const ROLLUPS: Rollup[] = ['tracked_link_visit_days', 'ai_run_daily_metrics'];

const addDays = (day: string, days: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

@Injectable()
export class MaintenanceRollupsService {
  constructor(
    @Inject(MaintenanceRollupsRepository) private readonly repository: MaintenanceRollupsRepository,
    @Inject(StoresService) private readonly stores: StoresService,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async ensurePartitions() {
    await this.repository.ensureMonthlyPartitions(MONTHS_AHEAD);
    if ((await this.repository.futureMonthCount()) < 2)
      throw maintenanceError('MAINTENANCE_PARTITIONS_MISSING');
  }

  async rollUpFinishedDays() {
    for (const rollup of ROLLUPS) await this.rollUp(rollup);
  }

  dropExpiredPartitions() {
    return this.repository.dropExpiredPartitions();
  }

  private async rollUp(rollup: Rollup) {
    const finished = this.lastFinishedDay();
    const recorded = await this.repository.watermark(rollup);
    let done = recorded ?? (await this.dayBeforeOldestPartition(rollup));
    if (done === null) return;
    let expected = recorded;
    for (let days = 0; done < finished && days < MAX_DAYS_PER_RUN; days += 1) {
      const day = addDays(done, 1);
      await this.rollUpDay(rollup, day);
      // A lost race means another run already moved on; this run stops without undoing it.
      if (!(await this.repository.advanceWatermark(rollup, expected, day))) return;
      done = day;
      expected = day;
    }
  }

  private async dayBeforeOldestPartition(rollup: Rollup) {
    const oldest = await this.repository.oldestPartitionDay(rollup);
    return oldest === null ? null : addDays(oldest, -1);
  }

  // Every store counts, including suspended and closing ones, so the watermark means "all stores".
  private async rollUpDay(rollup: Rollup, day: string) {
    let after: string | null = null;
    for (;;) {
      const page = await this.stores.maintenanceStoreIds(after, STORE_PAGE_SIZE);
      for (const storeId of page) {
        if (rollup === 'tracked_link_visit_days')
          await this.repository.rollUpLinkVisits(storeId, day);
        else await this.repository.rollUpAiRuns(storeId, day);
      }
      if (page.length < STORE_PAGE_SIZE) return;
      after = page.at(-1) ?? null;
    }
  }

  // Bangladesh has no daylight saving, so Dhaka is always UTC+6.
  private lastFinishedDay() {
    return addDays(
      new Date(this.clock.now().getTime() + 6 * HOUR_MS).toISOString().slice(0, 10),
      -1,
    );
  }
}
