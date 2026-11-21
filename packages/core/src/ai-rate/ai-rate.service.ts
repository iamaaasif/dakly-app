import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';

import type { AiRateResponse } from '@dakly/contracts/ai-rate';

import { Clock } from '../platform/clock';
import { loadEnv } from '../platform/config/env';
import { newId } from '../platform/database/new-id';
import { AiRateRepository } from './ai-rate.repository';

// Every saved AI run reads this, so a 60 second cache keeps it off the database.
const CACHE_MS = 60_000;
const storedValue = z.object({ poishaPerUsd: z.number().int().positive() });

@Injectable()
export class AiRateService {
  private cached: { rate: AiRateResponse; loadedAt: number } | null = null;

  constructor(
    @Inject(AiRateRepository) private readonly repository: AiRateRepository,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async current(): Promise<AiRateResponse> {
    const now = this.clock.now().getTime();
    if (this.cached && now - this.cached.loadedAt < CACHE_MS) return this.cached.rate;
    const row = await this.repository.read();
    const stored = storedValue.safeParse(row?.value);
    const rate: AiRateResponse = stored.success
      ? {
          poishaPerUsd: stored.data.poishaPerUsd,
          isSet: true,
          updatedAt: row?.updatedAt.toISOString() ?? null,
        }
      : {
          poishaPerUsd: Math.round(loadEnv().AI_USD_TO_BDT_RATE * 100),
          isSet: false,
          updatedAt: null,
        };
    this.cached = { rate, loadedAt: now };
    return rate;
  }

  async change(input: { staffUserId: string; poishaPerUsd: number; reason: string; ip: string }) {
    await this.repository.change({ id: newId(), ...input });
    this.cached = null;
    return this.current();
  }

  // Micro dollars × poisha per dollar ÷ one million, rounded to the nearest poisha.
  async toPoisha(costMicroUsd: number): Promise<number> {
    const { poishaPerUsd } = await this.current();
    return Math.round((costMicroUsd * poishaPerUsd) / 1_000_000);
  }
}
