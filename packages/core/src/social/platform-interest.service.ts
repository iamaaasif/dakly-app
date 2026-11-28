import { Inject, Injectable } from '@nestjs/common';

import type { PlatformInterests } from '@dakly/contracts/social';

import { PlatformInterestRepository } from './platform-interest.repository';

type Platform = PlatformInterests['platforms'][number];

@Injectable()
export class PlatformInterestService {
  constructor(
    @Inject(PlatformInterestRepository) private readonly repository: PlatformInterestRepository,
  ) {}

  async platforms(storeId: string, userId: string): Promise<PlatformInterests> {
    return { platforms: await this.repository.platforms(storeId, userId) };
  }

  async ask(storeId: string, userId: string, platform: Platform): Promise<PlatformInterests> {
    await this.repository.add(storeId, userId, platform);
    return this.platforms(storeId, userId);
  }

  async withdraw(storeId: string, userId: string, platform: Platform): Promise<PlatformInterests> {
    await this.repository.remove(storeId, userId, platform);
    return this.platforms(storeId, userId);
  }
}
