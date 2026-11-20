import { Inject, Injectable } from '@nestjs/common';

import { usesOrderFields } from '@dakly/contracts/automations/text';

import { OrderConfirmationService } from '../orders/order-confirmation.service';
import { OrderReportingService } from '../orders/order-reporting.service';
import { renderOrderText } from './automation-order-text';
import { automationError } from './automations.errors';

export type PreparedOrderText = {
  // Filled with a stand-in link of the real length, to count SMS parts before credits are reserved.
  counted: string;
  render: () => Promise<string>;
};

@Injectable()
export class AutomationOrderTextService {
  constructor(
    @Inject(OrderReportingService) private readonly orders: OrderReportingService,
    @Inject(OrderConfirmationService) private readonly confirmations: OrderConfirmationService,
  ) {}

  // Undefined when the text names no order field.
  async prepare(
    storeId: string,
    orderId: string | null,
    text: string,
  ): Promise<PreparedOrderText | undefined> {
    if (!usesOrderFields(text)) return undefined;
    const order = orderId ? await this.orders.triggerFacts(storeId, orderId) : undefined;
    if (!orderId || !order) throw automationError('AUTOMATION_ORDER_MISSING');
    return {
      counted: renderOrderText(text, order, this.confirmations.sampleUrl()),
      render: async () =>
        renderOrderText(text, order, await this.confirmations.issueUrl(storeId, orderId)),
    };
  }
}
