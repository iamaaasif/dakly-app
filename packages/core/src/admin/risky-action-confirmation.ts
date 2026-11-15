import { createHmac, timingSafeEqual } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { loadEnv } from '../platform/config/env';
import { supportError } from './support.errors';

@Injectable()
export class RiskyActionConfirmation {
  private readonly key = loadEnv().STAFF_SESSION_SIGNING_KEY;
  sign(effect: Record<string, unknown>): string {
    if (!this.key) throw supportError('CONFIRMATION_UNAVAILABLE');
    return createHmac('sha256', Buffer.from(this.key, 'base64'))
      .update('dakly-admin-effect-confirmation-v1:')
      .update(JSON.stringify(effect))
      .digest('hex');
  }
  verify(effect: Record<string, unknown>, proof: string): void {
    const expected = Buffer.from(this.sign(effect), 'hex');
    const received = Buffer.from(proof, 'hex');
    if (received.length !== expected.length || !timingSafeEqual(received, expected))
      throw supportError('CONFIRMATION_INVALID');
  }
}
