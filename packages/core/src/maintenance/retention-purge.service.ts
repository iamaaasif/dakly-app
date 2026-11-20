import { Inject, Injectable } from '@nestjs/common';

import { AutomationRunsService } from '../automations/automation-runs.service';
import { CampaignsService } from '../campaigns/campaigns.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SessionsService } from '../sessions/sessions.service';
import { StoresService } from '../stores/stores.service';

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
    @Inject(SessionsService) private readonly sessions: SessionsService,
  ) {}

  async purgeStoreTables() {
    let after: string | null = null;
    for (;;) {
      const page = await this.stores.maintenanceStoreIds(after, STORE_PAGE_SIZE);
      for (const storeId of page) {
        await this.notifications.purgeExpired(storeId);
        await this.campaigns.purgeExpiredRecipients(storeId);
        await this.automationRuns.purgeExpiredSteps(storeId);
      }
      if (page.length < STORE_PAGE_SIZE) return;
      after = page.at(-1) ?? null;
    }
  }

  purgeExpiredSessions() {
    return this.sessions.purgeExpired();
  }
}
