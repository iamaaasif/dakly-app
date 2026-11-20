import { describe, expect, it, vi } from 'vitest';

import type { AuditArchiveService } from './audit-archive.service';
import type { MaintenanceRollupsService } from './maintenance-rollups.service';
import { MaintenanceService } from './maintenance.service';

describe('MaintenanceService', () => {
  const archive = {
    archiveExpiredMonths: vi.fn().mockResolvedValue(undefined),
  } as unknown as AuditArchiveService;

  it('runs the later steps after a failed one, then reports the failure', async () => {
    const rollups = {
      ensurePartitions: vi.fn().mockResolvedValue(undefined),
      rollUpFinishedDays: vi.fn().mockRejectedValue(new Error('store scan failed')),
      dropExpiredPartitions: vi.fn().mockResolvedValue(0),
    };
    const service = new MaintenanceService(
      rollups as unknown as MaintenanceRollupsService,
      archive,
    );

    await expect(service.run()).rejects.toMatchObject({ code: 'MAINTENANCE_STEPS_FAILED' });
    expect(rollups.dropExpiredPartitions).toHaveBeenCalledOnce();
  });

  it('finishes quietly when every step works', async () => {
    const rollups = {
      ensurePartitions: vi.fn().mockResolvedValue(undefined),
      rollUpFinishedDays: vi.fn().mockResolvedValue(undefined),
      dropExpiredPartitions: vi.fn().mockResolvedValue(0),
    };
    await new MaintenanceService(rollups as unknown as MaintenanceRollupsService, archive).run();
  });
});
