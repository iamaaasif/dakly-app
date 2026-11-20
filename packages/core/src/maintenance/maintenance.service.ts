import { Inject, Injectable, Logger } from '@nestjs/common';

import { AccountSecurityEventsService } from '../account-security-events/account-security-events.service';
import { SessionsService } from '../sessions/sessions.service';
import { AuditArchiveService } from './audit-archive.service';
import { FilePurgeService } from './file-purge.service';
import { MaintenanceRollupsService } from './maintenance-rollups.service';
import { maintenanceError } from './maintenance.errors';
import { RetentionPurgeService } from './retention-purge.service';

@Injectable()
export class MaintenanceService {
  private readonly logger = new Logger(MaintenanceService.name);

  constructor(
    @Inject(MaintenanceRollupsService) private readonly rollups: MaintenanceRollupsService,
    @Inject(AuditArchiveService) private readonly auditArchive: AuditArchiveService,
    @Inject(FilePurgeService) private readonly files: FilePurgeService,
    @Inject(AccountSecurityEventsService)
    private readonly accountEvents: AccountSecurityEventsService,
    @Inject(RetentionPurgeService) private readonly retention: RetentionPurgeService,
    @Inject(SessionsService) private readonly sessions: SessionsService,
  ) {}

  // Each step is safe to repeat, and a failed step does not stop the others: dropping a month
  // is guarded by the rollup watermark, so running it after a failed rollup loses nothing.
  async run() {
    const steps = [
      ['ensure partitions', () => this.rollups.ensurePartitions()],
      ['roll up finished days', () => this.rollups.rollUpFinishedDays()],
      ['drop expired partitions', () => this.rollups.dropExpiredPartitions()],
      ['archive audit months', () => this.auditArchive.archiveExpiredMonths()],
      ['purge expired files', () => this.files.purgeExpiredFiles()],
      ['purge orphan product objects', () => this.files.purgeOrphanProductObjects()],
      ['purge expired store rows', () => this.retention.purgeStoreTables()],
      ['purge expired sessions', () => this.sessions.purgeExpired()],
      ['purge account history', () => this.accountEvents.purgeExpired()],
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
