import { Inject, Injectable } from '@nestjs/common';

import { toAsciiDigits } from '@dakly/contracts/digits';
import { orderChatFillModelSchema, type OrderChatFill } from '@dakly/contracts/order-entry';
import { bdMobileSchema } from '@dakly/contracts/phone';

import { AiService } from '../ai/ai.service';
import { DeliveryService } from '../delivery/delivery.service';
import { orderError } from './orders.errors';
import { fillOrderFromChat } from './prompts/fill-order-from-chat.v1';

@Injectable()
export class OrderChatFillService {
  constructor(
    @Inject(AiService) private readonly ai: AiService,
    @Inject(DeliveryService) private readonly delivery: DeliveryService,
  ) {}

  // Fills the customer card only. It never reads a price, so nothing here can change an amount.
  async fill(storeId: string, text: string): Promise<OrderChatFill> {
    const result = await this.ai.run(storeId, {
      tier: 'fast',
      purpose: 'order_fill',
      prompt: fillOrderFromChat,
      input: JSON.stringify({ chat: text }),
      output: orderChatFillModelSchema,
    });
    if (result.kind !== 'output') throw orderError('ORDER_FILL_UNAVAILABLE');
    const { name, phone, address, area } = result.output;
    const found = area ? await this.findArea(storeId, area) : undefined;
    return {
      name: name || null,
      phone: writtenPhone(phone, text),
      address: address || null,
      area: found ?? null,
    };
  }

  // A typed place is accepted only when it is exact or the only match; a guess would price the wrong zone.
  private async findArea(storeId: string, place: string) {
    const parts = place.split(/[,،]/).map((part) => part.trim());
    for (const candidate of new Set([place.trim(), ...parts])) {
      if (candidate.length < 2) continue;
      const { items } = await this.delivery.searchAreas(storeId, { search: candidate, limit: 2 });
      const exact = items.find(
        ({ name, nameBn }) =>
          name.toLowerCase() === candidate.toLowerCase() || nameBn === candidate,
      );
      const found = exact ?? (items.length === 1 ? items[0] : undefined);
      if (found) return found;
    }
    return undefined;
  }
}

// The number must appear in the chat itself, so the model cannot make one up.
function writtenPhone(phone: string | null, text: string): string | null {
  const parsed = phone ? bdMobileSchema.safeParse(phone) : undefined;
  if (!parsed?.success) return null;
  const digits = toAsciiDigits(text).replace(/[\s-]/g, '');
  return digits.includes(parsed.data.slice(1)) ? parsed.data : null;
}
