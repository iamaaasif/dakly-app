import { Inject, Injectable } from '@nestjs/common';

import { usesOrderFields } from '@dakly/contracts/automations/text';

import { LinksService } from '../links/links.service';
import { OrderReportingService } from '../orders/order-reporting.service';
import { renderOrderText } from './automation-order-text';
import { automationError } from './automations.errors';

export type PreparedOrderText = {
  // Filled with a stand-in link of the real length, to count SMS parts before credits are reserved.
  counted: string;
  render: (contactId: string) => Promise<string>;
};

@Injectable()
export class AutomationOrderTextService {
  constructor(
    @Inject(OrderReportingService) private readonly orders: OrderReportingService,
    @Inject(LinksService) private readonly links: LinksService,
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
      counted: renderOrderText(text, order, this.links.sampleOrderConfirmUrl()),
      render: async (contactId) =>
        renderOrderText(text, order, await this.links.orderConfirmUrl(storeId, orderId, contactId)),
    };
  }
}
