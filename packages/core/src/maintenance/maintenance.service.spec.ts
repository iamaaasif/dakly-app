import { describe, expect, it, vi } from 'vitest';

import type { AccountSecurityEventsService } from '../account-security-events/account-security-events.service';
import type { SessionsService } from '../sessions/sessions.service';
import type { AuditArchiveService } from './audit-archive.service';
import type { FilePurgeService } from './file-purge.service';
import type { MaintenanceRollupsService } from './maintenance-rollups.service';
import { MaintenanceService } from './maintenance.service';
import type { RetentionPurgeService } from './retention-purge.service';

function build(rollUp: () => Promise<void>) {
  const done = () => vi.fn().mockResolvedValue(undefined);
  const parts = {
    rollups: {
      ensurePartitions: done(),
      rollUpFinishedDays: vi.fn(rollUp),
      dropExpiredPartitions: done(),
    },
    archive: { archiveExpiredMonths: done() },
    files: { purgeExpiredFiles: done(), purgeOrphanProductObjects: done() },
    accountEvents: { purgeExpired: done() },
    retention: { purgeStoreTables: done() },
    sessions: { purgeExpired: done() },
  };
  const service = new MaintenanceService(
    parts.rollups as unknown as MaintenanceRollupsService,
    parts.archive as unknown as AuditArchiveService,
    parts.files as unknown as FilePurgeService,
    parts.accountEvents as unknown as AccountSecurityEventsService,
    parts.retention as unknown as RetentionPurgeService,
    parts.sessions as unknown as SessionsService,
  );
  return { service, ...parts };
}

describe('MaintenanceService', () => {
  it('runs every later step after a failed one, then reports the failure', async () => {
    const { service, rollups, archive, files, accountEvents, retention, sessions } = build(() =>
      Promise.reject(new Error('store scan failed')),
    );

    await expect(service.run()).rejects.toMatchObject({ code: 'MAINTENANCE_STEPS_FAILED' });

    expect(rollups.dropExpiredPartitions).toHaveBeenCalledOnce();
    expect(archive.archiveExpiredMonths).toHaveBeenCalledOnce();
    expect(files.purgeExpiredFiles).toHaveBeenCalledOnce();
    expect(files.purgeOrphanProductObjects).toHaveBeenCalledOnce();
    expect(accountEvents.purgeExpired).toHaveBeenCalledOnce();
    expect(retention.purgeStoreTables).toHaveBeenCalledOnce();
    expect(sessions.purgeExpired).toHaveBeenCalledOnce();
  });

  it('finishes quietly when every step works', async () => {
    await build(() => Promise.resolve()).service.run();
  });
});
