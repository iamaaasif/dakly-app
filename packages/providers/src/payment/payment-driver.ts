import type { gateways, paymentCallbackSchema } from '@dakly/contracts/payments';

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

// Prefix an account-local event id with the merchant namespace before returning it.
export type PaymentCallback = ReturnType<typeof paymentCallbackSchema.parse>;

// Each shop connects its own merchant account. Dakly never holds shop money.
export type PaymentMerchant =
  { flow: 'billing' } | { flow: 'shop'; credentials: Buffer; mode: 'live' | 'sandbox' };

export type PaymentDriver = {
  readonly gateway: PaymentGateway;
  createPayment(input: CreatePaymentInput, merchant: PaymentMerchant): Promise<CreatePaymentResult>;
  getStatus(gatewayPaymentId: string, merchant: PaymentMerchant): Promise<PaymentStatus>;
  readonly callbackHeaders: readonly string[];
  callbackReference(rawBody: Buffer): string | undefined;
  verifyCallback(
    rawBody: Buffer,
    headers: Readonly<Record<string, string | string[] | undefined>>,
    merchant: PaymentMerchant,
  ): PaymentCallback | undefined;
};
