import { Inject, Injectable, Logger } from '@nestjs/common';

import type { GoogleIdentityDriver } from '@dakly/providers/google/google-identity-driver';

import { measureVendorCall } from '../platform/logging/vendor-call-metric';
import { authError } from './auth.errors';
import { GOOGLE_IDENTITY_DRIVER } from './google-provider';

@Injectable()
export class GoogleIdentityService {
  private readonly logger = new Logger(GoogleIdentityService.name);
  constructor(@Inject(GOOGLE_IDENTITY_DRIVER) private readonly driver: GoogleIdentityDriver) {}
  async verify(idToken: string) {
    try {
      return await measureVendorCall(
        this.logger,
        'google_identity_verification',
        'Google identity verification measured',
        () => this.driver.verify(idToken),
      );
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'GOOGLE_IDENTITY_INVALID'
      )
        throw authError('AUTH_INVALID_CREDENTIALS');
      throw authError('AUTH_GOOGLE_UNAVAILABLE');
    }
  }
}
