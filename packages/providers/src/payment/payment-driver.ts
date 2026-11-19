import type { gateways } from '@dakly/contracts/payments';

export type PaymentGateway = (typeof gateways)[number];

export type CreatePaymentInput = {
  amountPoisha: number;
  orderReference: string;
  callbackUrl: string;
};

export type CreatePaymentResult = {
  gatewayPaymentId: string;
  redirectUrl: string;
};

export type PaymentStatus =
  | { status: 'pending' | 'failed' | 'cancelled' }
  | {
      status: 'paid';
      amountPoisha: number;
      currency: string;
      merchantReference: string;
      transactionId: string;
    };

export type PaymentCallback = {
  eventId: string;
  merchantReference: string;
};

export type PaymentMerchant =
  { flow: 'billing' } | { flow: 'shop'; credentials: Buffer; mode: 'live' | 'sandbox' };

export type PaymentDriver = {
  readonly gateway: PaymentGateway;
  createPayment(input: CreatePaymentInput, merchant: PaymentMerchant): Promise<CreatePaymentResult>;
  getStatus(gatewayPaymentId: string, merchant: PaymentMerchant): Promise<PaymentStatus>;
  verifyCallback(
    rawBody: Buffer,
    headers: Readonly<Record<string, string | string[] | undefined>>,
  ): PaymentCallback | undefined;
};
