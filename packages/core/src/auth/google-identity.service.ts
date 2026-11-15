import { performance } from 'node:perf_hooks';

import { Inject, Injectable, Logger } from '@nestjs/common';

import type { GoogleIdentityDriver } from '@dakly/providers/google/google-identity-driver';

import { authError } from './auth.errors';
import { GOOGLE_IDENTITY_DRIVER } from './google-provider';

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
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'GOOGLE_IDENTITY_INVALID'
      )
        throw authError('AUTH_INVALID_CREDENTIALS');
      throw authError('AUTH_GOOGLE_UNAVAILABLE');
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
