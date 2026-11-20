import { Inject, Injectable, Logger } from '@nestjs/common';

import { AutomationRunsService } from '../automations/automation-runs.service';
import { CampaignsService } from '../campaigns/campaigns.service';
import { MessageArchiveService } from '../messaging/message-archive.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StoresService } from '../stores/stores.service';
import { maintenanceError } from './maintenance.errors';

const STORE_PAGE_SIZE = 100;

// Each feature deletes its own expired rows in batches of 5,000; this only decides when and for
// which stores. Retention for every table is in docs/data/growth.md.
@Injectable()
export class RetentionPurgeService {
  constructor(
    @Inject(StoresService) private readonly stores: StoresService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(CampaignsService) private readonly campaigns: CampaignsService,
    @Inject(AutomationRunsService) private readonly automationRuns: AutomationRunsService,
    @Inject(MessageArchiveService) private readonly messageArchive: MessageArchiveService,
  ) {}

  private readonly logger = new Logger(RetentionPurgeService.name);

  async purgeStoreTables() {
    await this.forEachStore(async (storeId) => {
      await this.notifications.purgeExpired(storeId);
      await this.campaigns.purgeExpiredRecipients(storeId);
      await this.automationRuns.purgeExpiredSteps(storeId);
    });
  }

  // One store's failure must not stop the others, so each is logged by id and the step fails
  // after the last store. The log carries no message text.
  async archiveStoreMessages() {
    let failed = 0;
    await this.forEachStore(async (storeId) => {
      try {
        await this.messageArchive.archiveExpired(storeId);
      } catch (error) {
        failed += 1;
        this.logger.error(
          `Message archive failed for store ${storeId}: ${error instanceof Error ? error.name : 'unknown error'}`,
        );
      }
    });
    if (failed > 0) throw maintenanceError('MAINTENANCE_MESSAGE_ARCHIVE_FAILED');
  }

  private async forEachStore(work: (storeId: string) => Promise<void>) {
    let after: string | null = null;
    for (;;) {
      const page = await this.stores.maintenanceStoreIds(after, STORE_PAGE_SIZE);
      for (const storeId of page) await work(storeId);
      if (page.length < STORE_PAGE_SIZE) return;
      after = page.at(-1) ?? null;
    }
  }
}
