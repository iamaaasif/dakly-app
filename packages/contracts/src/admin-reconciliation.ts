import { z } from 'zod';

import { type gateways, type settlementLineStatuses } from './payments';
import { supportReasonSchema } from './support';

// Hand matching and refunds need the payment lookup and gateway refund calls, which come later.
export const settlementLineActions = ['gateway_error', 'escalated'] as const;

export const settlementLineActionSchema = z.strictObject({
  action: z.enum(settlementLineActions),
  reason: supportReasonSchema,
  confirmed: z.literal(true, { error: 'Confirm the effect before saving' }),
});
export type SettlementLineActionInput = z.infer<typeof settlementLineActionSchema>;

export type ReconciliationLine = {
  id: string;
  gateway: (typeof gateways)[number];
  settlementDate: string;
  gatewayTransactionId: string;
  amountPoisha: number;
  feePoisha: number;
  status: (typeof settlementLineStatuses)[number];
  note: string | null;
};
export type ReconciliationQueueResponse = { lines: ReconciliationLine[] };
