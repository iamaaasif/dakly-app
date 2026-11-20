import { Inject, Injectable } from '@nestjs/common';

import { CampaignSetupRepository } from './campaign-setup.repository';

@Injectable()
export class CampaignSetupService {
  constructor(
    @Inject(CampaignSetupRepository) private readonly repository: CampaignSetupRepository,
  ) {}

  // For the Dashboard setup checklist: has any campaign started sending.
  hasStarted(storeId: string): Promise<boolean> {
    return this.repository.hasStarted(storeId);
  }
}
