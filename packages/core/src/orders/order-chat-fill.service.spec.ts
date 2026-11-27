import { describe, expect, it } from 'vitest';

import type { AreaSearchResult } from '@dakly/contracts/delivery';

import type { AiService } from '../ai/ai.service';
import type { DeliveryService } from '../delivery/delivery.service';
import { OrderChatFillService } from './order-chat-fill.service';

type Reading = {
  name: string | null;
  phone: string | null;
  address: string | null;
  area: string | null;
};

const area = (id: number, name: string, districtName: string, nameBn: string | null = null) =>
  ({
    id,
    name,
    nameBn,
    kind: 'upazila',
    parentId: 1,
    districtId: 1,
    districtName,
  }) as AreaSearchResult;
const places = [area(10, 'Mirpur', 'Dhaka', 'মিরপুর'), area(11, 'Mirpur', 'Kushtia')];

function serviceReading(reading: Reading | 'unavailable') {
  const ai = {
    run: () =>
      Promise.resolve(
        reading === 'unavailable'
          ? { kind: 'failure', code: 'AI_PAUSED' }
          : { kind: 'output', output: reading },
      ),
  } as unknown as AiService;
  const delivery = {
    searchAreas: (_storeId: string, { search }: { search: string }) =>
      Promise.resolve({
        items: places.filter(({ name, nameBn }) =>
          [name, nameBn ?? ''].some((text) => text.toLowerCase().startsWith(search.toLowerCase())),
        ),
      }),
  } as unknown as DeliveryService;
  return new OrderChatFillService(ai, delivery);
}

const chat = 'নাম রহিমা, ০১৭১২৩৪৫৬৭৮, মিরপুর ১০, ঢাকা';

describe('OrderChatFillService', () => {
  it('returns the details the chat holds with the phone in its stored form', async () => {
    const filled = await serviceReading({
      name: 'রহিমা',
      phone: '+8801712345678',
      address: 'রোড ৫',
      area: null,
    }).fill('store', chat);
    expect(filled).toEqual({
      name: 'রহিমা',
      phone: '01712345678',
      address: 'রোড ৫',
      areaId: null,
      areaLabel: null,
    });
  });

  it('drops a phone number the chat does not contain', async () => {
    const filled = await serviceReading({
      name: null,
      phone: '01999999999',
      address: null,
      area: null,
    }).fill('store', chat);
    expect(filled.phone).toBeNull();
  });

  it('drops a phone that is not a Bangladesh mobile number', async () => {
    const filled = await serviceReading({
      name: null,
      phone: '12345',
      address: null,
      area: null,
    }).fill('store', '12345');
    expect(filled.phone).toBeNull();
  });

  it('picks an area only when it is the only match or the exact name', async () => {
    const exact = await serviceReading({
      name: null,
      phone: null,
      address: null,
      area: 'মিরপুর',
    }).fill('store', chat);
    expect(exact).toMatchObject({ areaId: 10, areaLabel: 'Mirpur, Dhaka' });
    const ambiguous = await serviceReading({
      name: null,
      phone: null,
      address: null,
      area: 'Mirp',
    }).fill('store', chat);
    expect(ambiguous).toMatchObject({ areaId: null, areaLabel: null });
  });

  it('tells staff to type the details when the AI cannot read the chat', async () => {
    await expect(serviceReading('unavailable').fill('store', chat)).rejects.toMatchObject({
      code: 'ORDER_FILL_UNAVAILABLE',
    });
  });
});
