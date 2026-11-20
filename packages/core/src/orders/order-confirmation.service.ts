import { randomBytes } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import type { OrderConfirmationAnswer } from '@dakly/contracts/orders';

import { RateLimiter } from '../platform/cache/rate-limiter';
import { Clock } from '../platform/clock';
import { loadEnv } from '../platform/config/env';
import { hashToken } from '../platform/crypto/token-hash';
import { StoreTransaction } from '../platform/database/store-transaction';
import { AppError } from '../platform/errors/app-error';
import { StoresService } from '../stores/stores.service';
import {
  OrderConfirmationRepository,
  type ConfirmationToken,
} from './order-confirmation.repository';
import { orderError } from './orders.errors';
import { OrdersService } from './orders.service';

// 32 random bytes in base64url.
const TOKEN_LENGTH = 43;
const TAPS_PER_IP_PER_MINUTE = 60;
const TAPS_PER_TOKEN_PER_MINUTE = 10;
const noPhone = { seeFullPhone: false };

export type ConfirmationView =
  | { state: 'closed' }
  | {
      state: 'open';
      storeName: string;
      orderNumber: number;
      items: { name: string; quantity: number; totalPoisha: number }[];
      totalPoisha: number;
      address: string;
    };
export type ConfirmationOutcome = 'confirmed' | 'cancelled' | 'closed';

@Injectable()
export class OrderConfirmationService {
  constructor(
    @Inject(OrderConfirmationRepository)
    private readonly repository: OrderConfirmationRepository,
    @Inject(OrdersService) private readonly orders: OrdersService,
    @Inject(StoresService) private readonly stores: StoresService,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(RateLimiter) private readonly limiter: RateLimiter,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  // The token is in the address only; the database keeps its sha256, so a leak cannot rebuild a
  // link. Every message gets its own token and all of them work while the order is in To confirm.
  async issueUrl(storeId: string, orderId: string): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    await this.repository.insertToken(storeId, orderId, hashToken(token));
    return confirmUrl(token);
  }

  // Opening the page changes nothing: phones fetch links to draw previews.
  async view(token: string, ip: string): Promise<ConfirmationView> {
    const found = await this.find(token, ip);
    if (!found) return { state: 'closed' };
    const order = await this.orders.getById(found.storeId, found.orderId, noPhone);
    if (order.stage !== 'to_confirm') return { state: 'closed' };
    const store = await this.stores.settings(found.storeId);
    return {
      state: 'open',
      storeName: store.name,
      orderNumber: order.number,
      items: order.items.map((item) => ({
        name: item.variantTitle ? `${item.productName} - ${item.variantTitle}` : item.productName,
        quantity: item.quantity,
        totalPoisha: item.unitPricePoisha * item.quantity - item.lineDiscountPoisha,
      })),
      totalPoisha: order.totalPoisha,
      address: `${order.recipientAddress}, ${order.recipientDistrict}`,
    };
  }

  // The answer acts only on an order still in To confirm and spends the token, so a second tap
  // or a stale page changes nothing. It never touches the contact (D26).
  async answer(
    token: string,
    answer: OrderConfirmationAnswer,
    ip: string,
  ): Promise<ConfirmationOutcome> {
    const found = await this.find(token, ip);
    if (!found) return 'closed';
    const { storeId, orderId, confirmationId } = found;
    return this.transaction.run(storeId, async () => {
      if (!(await this.repository.markUsed(storeId, confirmationId, this.clock.now())))
        return 'closed';
      try {
        await this.orders.changeStage(
          storeId,
          orderId,
          answer === 'confirm'
            ? { to: 'to_pack' }
            : { to: 'cancelled', reason: 'customer_cancelled' },
          {
            actor: { kind: 'system' },
            access: noPhone,
            onlyFrom: 'to_confirm',
            confirmationMethod: 'sms_link',
          },
        );
      } catch (error) {
        // The order moved on, or was synced from a store, before the customer answered.
        if (error instanceof AppError && error.code === 'ORDER_STAGE_NOT_ALLOWED') return 'closed';
        throw error;
      }
      return answer === 'confirm' ? 'confirmed' : 'cancelled';
    });
  }

  // An unknown, used and expired token all look the same to the customer.
  private async find(token: string, ip: string): Promise<ConfirmationToken | undefined> {
    const tokenHash = hashToken(token);
    await this.limit(`orders:confirm:ip:${hashToken(ip).toString('hex')}`, TAPS_PER_IP_PER_MINUTE);
    await this.limit(
      `orders:confirm:token:${tokenHash.toString('hex')}`,
      TAPS_PER_TOKEN_PER_MINUTE,
    );
    const found = await this.repository.locate(tokenHash);
    return found && !found.isUsed ? found : undefined;
  }

  private async limit(key: string, perMinute: number): Promise<void> {
    if (!(await this.limiter.consume(key, perMinute, 60)).allowed)
      throw orderError('ORDER_CONFIRMATION_RATE_LIMITED');
  }

  // An address as long as a real one, to count the characters a text gains.
  sampleUrl(): string {
    return confirmUrl('0'.repeat(TOKEN_LENGTH));
  }
}

function confirmUrl(token: string): string {
  return `${loadEnv().SHORT_LINK_BASE_URL}/c/${token}`;
}
