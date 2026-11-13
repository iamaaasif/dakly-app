export const gateways = ['bkash', 'nagad', 'city_bank'] as const;
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
