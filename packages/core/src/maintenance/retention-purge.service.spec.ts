import { describe, expect, it, vi } from 'vitest';

import type { AutomationRunsService } from '../automations/automation-runs.service';
import type { CampaignsService } from '../campaigns/campaigns.service';
import type { MessageArchiveService } from '../messaging/message-archive.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { StoresService } from '../stores/stores.service';
import { RetentionPurgeService } from './retention-purge.service';

describe('RetentionPurgeService', () => {
  it('purges every store on every page, not only the first', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => `store-${index}`);
    const maintenanceStoreIds = vi
      .fn()
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce(['store-last']);
    const purged: string[] = [];
    const record = (storeId: string) => {
      purged.push(storeId);
      return Promise.resolve();
    };
    const service = new RetentionPurgeService(
      { maintenanceStoreIds } as unknown as StoresService,
      { purgeExpired: record } as unknown as NotificationsService,
      { purgeExpiredRecipients: () => Promise.resolve() } as unknown as CampaignsService,
      { purgeExpiredSteps: () => Promise.resolve() } as unknown as AutomationRunsService,
      {} as MessageArchiveService,
    );

    await service.purgeStoreTables();

    expect(purged).toHaveLength(101);
    expect(purged.at(-1)).toBe('store-last');
    expect(maintenanceStoreIds).toHaveBeenLastCalledWith('store-99', 100);
  });

  it('archives every store even when one fails, then reports the failure', async () => {
    const archived: string[] = [];
    const service = new RetentionPurgeService(
      {
        maintenanceStoreIds: vi.fn().mockResolvedValueOnce(['one', 'bad', 'three']),
      } as unknown as StoresService,
      {} as NotificationsService,
      {} as CampaignsService,
      {} as AutomationRunsService,
      {
        archiveExpired: (storeId: string) => {
          if (storeId === 'bad') return Promise.reject(new Error('R2 unavailable'));
          archived.push(storeId);
          return Promise.resolve();
        },
      } as unknown as MessageArchiveService,
    );

    await expect(service.archiveStoreMessages()).rejects.toMatchObject({
      code: 'MAINTENANCE_MESSAGE_ARCHIVE_FAILED',
    });
    expect(archived).toEqual(['one', 'three']);
  });
});
