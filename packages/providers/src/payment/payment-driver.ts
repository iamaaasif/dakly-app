// bKash, Nagad and City Bank each get a driver behind this interface.
// Each shop connects its own merchant account; Dakly never holds shop money.

export type PaymentGateway = 'bkash' | 'nagad' | 'citybank';

export type CreatePaymentInput = {
  amountPoisha: number;
  orderReference: string;
  callbackUrl: string;
};

export type CreatePaymentResult = {
  gatewayPaymentId: string;
  redirectUrl: string;
};

export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'cancelled';

export type PaymentDriver = {
  readonly gateway: PaymentGateway;
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  getStatus(gatewayPaymentId: string): Promise<PaymentStatus>;
};
