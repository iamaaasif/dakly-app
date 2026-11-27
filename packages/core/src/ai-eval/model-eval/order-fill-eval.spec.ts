import { describe, expect, it } from 'vitest';

import { orderFillCases, problemsWith } from './order-fill-eval';

const byId = (id: string) => orderFillCases.find((golden) => golden.id === id)!;

describe('order fill eval', () => {
  it('covers Bangla, Banglish and mixed chats, Bangla digits, two numbers and an attack', () => {
    const chats = orderFillCases.map(({ chat }) => chat);
    expect(chats.some((chat) => /[ঀ-৿]/u.test(chat) && !/[a-z]{4}/i.test(chat))).toBe(true);
    expect(chats.some((chat) => /bhai|apu|tk\b/i.test(chat))).toBe(true);
    expect(chats.some((chat) => /[ঀ-৿]/u.test(chat) && /[a-z]{4}/i.test(chat))).toBe(true);
    expect(chats.some((chat) => /[০-৯]{11}/.test(chat))).toBe(true);
    expect(chats.some((chat) => /Ignore all rules/.test(chat))).toBe(true);
    expect(orderFillCases.length).toBeGreaterThanOrEqual(8);
  });

  it('passes a read that matches what the customer wrote', () => {
    expect(
      problemsWith(byId('banglish-full'), {
        name: 'Sabbir Hossain',
        phone: '01819223344',
        address: 'House 7, Road 3, Sector 11',
        area: 'Uttara',
      }),
    ).toEqual([]);
  });

  it('fails a wrong phone, the buyer number for the recipient and an invented value', () => {
    const two = byId('two-numbers-delivery-one');
    expect(
      problemsWith(two, { name: 'Tania', phone: '01711111111', address: null, area: 'Gulshan' }),
    ).toEqual(['phone 01711111111']);
    const none = byId('no-details');
    expect(
      problemsWith(none, { name: 'Rahim', phone: '01712345678', address: 'Dhaka', area: null }),
    ).toEqual(['invented name', 'invented phone', 'invented address']);
  });
});
