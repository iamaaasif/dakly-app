import { z } from 'zod';

export const gateways = ['bkash', 'nagad', 'city_bank'] as const;
export const paymentGatewaySchema = z.enum(gateways);
export const MAX_PAYMENT_CALLBACK_BYTES = 64 * 1024;
export const paymentGateways = [...gateways, 'manual'] as const;
export const gatewayModes = ['live', 'sandbox'] as const;
export const gatewayCredentialStatuses = ['connected', 'needs_attention', 'disconnected'] as const;
// billing: Dakly is the merchant. shop: the shop's own merchant account (D14).
export const paymentFlows = ['billing', 'shop'] as const;
export const paymentPurposes = [
  'order_advance',
  'order_full',
  'subscription',
  'whatsapp_top_up',
  'sms_pack',
  'ai_top_up',
] as const;
export const paymentIntentStatuses = [
  'created',
  'pending',
  'succeeded',
  'failed',
  'cancelled',
  'expired',
  'needs_review',
  'partially_refunded',
  'refunded',
  'disputed',
] as const;
export const paymentReviewReasons = [
  'amount_mismatch',
  'duplicate',
  'late_success',
  'manual_unverified',
] as const;
export const paymentEventKinds = [
  'created',
  'sent',
  'opened',
  'redirected',
  'callback',
  'verified',
  'status_changed',
  'refund_requested',
  'refund_result',
  'dispute',
] as const;
export const refundStatuses = [
  'requested',
  'pending',
  'succeeded',
  'failed',
  'recorded_manually',
] as const;
export const settlementLineStatuses = [
  'matched',
  'unmatched',
  'gateway_error',
  'refunded',
  'escalated',
] as const;

const intentFields = {
  gateway: paymentGatewaySchema,
  amountPoisha: z.int().positive(),
  expiresAt: z.date(),
};

export const createPaymentIntentSchema = z.discriminatedUnion('flow', [
  z.strictObject({
    ...intentFields,
    flow: z.literal('billing'),
    purpose: z.enum(['subscription', 'whatsapp_top_up', 'sms_pack', 'ai_top_up']),
    invoiceId: z.uuid().optional(),
  }),
  z.strictObject({
    ...intentFields,
    flow: z.literal('shop'),
    purpose: z.enum(['order_advance', 'order_full']),
    orderId: z.uuid().optional(),
    credentialId: z.uuid(),
  }),
]);

export type CreatePaymentIntent = z.infer<typeof createPaymentIntentSchema>;

export const paymentCallbackSchema = z.strictObject({
  eventId: z.string().min(1).max(512),
  merchantReference: z.string().min(1).max(512),
});
