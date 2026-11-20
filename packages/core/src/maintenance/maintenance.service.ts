import { Inject, Injectable, Logger } from '@nestjs/common';

import { AuditArchiveService } from './audit-archive.service';
import { MaintenanceRollupsService } from './maintenance-rollups.service';
import { maintenanceError } from './maintenance.errors';

@Injectable()
export class MaintenanceService {
  private readonly logger = new Logger(MaintenanceService.name);

  constructor(
    @Inject(MaintenanceRollupsService) private readonly rollups: MaintenanceRollupsService,
    @Inject(AuditArchiveService) private readonly auditArchive: AuditArchiveService,
  ) {}

  // Each step is safe to repeat, and a failed step does not stop the others: dropping a month
  // is guarded by the rollup watermark, so running it after a failed rollup loses nothing.
  async run() {
    const steps = [
      ['ensure partitions', () => this.rollups.ensurePartitions()],
      ['roll up finished days', () => this.rollups.rollUpFinishedDays()],
      ['drop expired partitions', () => this.rollups.dropExpiredPartitions()],
      ['archive audit months', () => this.auditArchive.archiveExpiredMonths()],
    ] as const;
    let failed = 0;
    for (const [name, step] of steps) {
      try {
        await step();
      } catch (error) {
        failed += 1;
        this.logger.error(
          `Maintenance step "${name}" failed`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }
    if (failed > 0) throw maintenanceError('MAINTENANCE_STEPS_FAILED');
  }
}
