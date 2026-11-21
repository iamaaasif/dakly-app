import { Inject, Injectable } from '@nestjs/common';

import type { ProviderHealthResponse, ProviderHealthRow } from '@dakly/contracts/ops-reports';

import { Clock } from '../platform/clock';
import { ProviderHealthRepository } from './provider-health.repository';

@Injectable()
export class ProviderHealthService {
  constructor(
    @Inject(ProviderHealthRepository) private readonly repository: ProviderHealthRepository,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async report(): Promise<ProviderHealthResponse> {
    const now = this.clock.now();
    const byProvider = new Map<string, ProviderHealthRow>();
    for (const row of await this.repository.spans(now)) {
      const entry = byProvider.get(row.provider) ?? {
        provider: row.provider,
        hourAttempts: 0,
        hourFailures: 0,
        dayAttempts: 0,
        dayFailures: 0,
        averageLatencyMsLastHour: null,
      };
      if (row.span === 'hour') {
        entry.hourAttempts = row.attempts;
        entry.hourFailures = row.failures;
        entry.averageLatencyMsLastHour = row.averageLatencyMs;
      } else {
        entry.dayAttempts = row.attempts;
        entry.dayFailures = row.failures;
      }
      byProvider.set(row.provider, entry);
    }
    return {
      generatedAt: now.toISOString(),
      providers: [...byProvider.values()].sort((a, b) => a.provider.localeCompare(b.provider)),
    };
  }
}
