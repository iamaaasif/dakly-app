import type { CreateOrderPaymentLink } from '@dakly/contracts/payments';

import { AppError } from '../platform/errors/app-error';
import { PAYMENT_ERRORS } from './payments.errors';

// Works out what a link asks for from the order's own figures; the caller cannot raise it past
// what the customer still owes.
export function orderLinkAmount(
  input: Pick<CreateOrderPaymentLink, 'kind' | 'amountPoisha'>,
  order: { totalPoisha: number; deliveryChargePoisha: number; advancePaidPoisha: number },
): number {
  const unpaid = order.totalPoisha - order.advancePaidPoisha;
  if (unpaid <= 0) throw new AppError('PAYMENT_ORDER_PAID', PAYMENT_ERRORS.PAYMENT_ORDER_PAID);
  if (input.kind === 'full') return unpaid;
  const amount = input.amountPoisha ?? order.deliveryChargePoisha;
  if (amount <= 0 || amount > unpaid)
    throw new AppError('PAYMENT_AMOUNT_INVALID', PAYMENT_ERRORS.PAYMENT_AMOUNT_INVALID);
  return amount;
}
