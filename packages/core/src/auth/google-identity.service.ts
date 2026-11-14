import { performance } from 'node:perf_hooks';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { GoogleIdentityDriver } from '@dakly/providers/google/google-identity-driver';
import { GOOGLE_IDENTITY_DRIVER } from './google-provider';
import { authError } from './auth.errors';

@Injectable()
export class GoogleIdentityService {
  private readonly logger = new Logger(GoogleIdentityService.name);
  constructor(@Inject(GOOGLE_IDENTITY_DRIVER) private readonly driver: GoogleIdentityDriver) {}
  async verify(idToken: string) {
    const startedAt = performance.now();
    let outcome: 'success' | 'failure' = 'failure';
    try {
      const identity = await this.driver.verify(idToken);
      outcome = 'success';
      return identity;
    } catch {
      throw authError('AUTH_INVALID_CREDENTIALS');
    } finally {
      this.logger.log(
        {
          event: 'metric',
          metric: 'google_identity_verification',
          count: 1,
          durationMilliseconds: performance.now() - startedAt,
          outcome,
        },
        'Google identity verification measured',
      );
    }
  }
}
