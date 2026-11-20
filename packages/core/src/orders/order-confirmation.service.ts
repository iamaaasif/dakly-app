import { randomBytes } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { loadEnv } from '../platform/config/env';
import { hashToken } from '../platform/crypto/token-hash';
import { OrderConfirmationRepository } from './order-confirmation.repository';

// 32 random bytes in base64url.
const TOKEN_LENGTH = 43;

@Injectable()
export class OrderConfirmationService {
  constructor(
    @Inject(OrderConfirmationRepository)
    private readonly repository: OrderConfirmationRepository,
  ) {}

  // The token is in the address only; the database keeps its sha256, so a leak cannot rebuild a
  // link. Every message gets its own token and all of them work while the order is in To confirm.
  async issueUrl(storeId: string, orderId: string): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    await this.repository.insertToken(storeId, orderId, hashToken(token));
    return confirmUrl(token);
  }

  // An address as long as a real one, to count the characters a text gains.
  sampleUrl(): string {
    return confirmUrl('0'.repeat(TOKEN_LENGTH));
  }
}

function confirmUrl(token: string): string {
  return `${loadEnv().SHORT_LINK_BASE_URL}/c/${token}`;
}
