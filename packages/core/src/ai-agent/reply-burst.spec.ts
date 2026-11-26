import { describe, expect, it } from 'vitest';

import { isDiscountRequest, requestedDiscountPoisha } from './manipulation-screen';
import { burstText, isFlood, replyToolChat } from './reply-burst';

const at = (minutes: number) => new Date(Date.UTC(2026, 10, 24, 12, minutes));
const message = (index: number, body: string, minutes: number) => ({
  id: `m${index}`,
  body,
  mediaText: null,
  attachments: [],
  senderIdentityId: 'customer',
  createdAt: at(minutes),
});
const turnOf = (inbound: ReturnType<typeof message>[]) =>
  ({ latest: inbound[0], inbound }) as unknown as Parameters<typeof burstText>[0];

describe('burstText', () => {
  it('uses the persisted latest message id and does not let an earlier ask advance the offer', () => {
    const discount = message(1, 'discount?', 1);
    const more = message(2, 'size M please', 2);
    expect(burstText(turnOf([discount]), 60_000, at(2)).discountAskMessageId).toBe('m1');
    expect(burstText(turnOf([more, discount]), 60_000, at(2)).discountAskMessageId).toBeUndefined();
  });

  it('passes only the latest customer counteroffer to the tool', () => {
    const previous = message(1, 'Would you take BDT 999?', 1);
    const latest = message(2, 'Can you do BDT 850?', 2);
    const burst = burstText(turnOf([latest, previous]), 60_000, at(2));
    expect(replyToolChat('chat', 'messenger', burst)).toMatchObject({
      discountAskMessageId: 'm2',
      requestedPricePoisha: 85000,
    });
    const lower = burstText(
      turnOf([message(3, 'Could you give me a lower price?', 2)]),
      60_000,
      at(2),
    );
    expect(lower.discountAskMessageId).toBe('m3');
    expect(lower.requestedPricePoisha).toBeUndefined();
    const media = { ...message(4, '', 2), mediaText: 'Can you do BDT 850?' };
    expect(burstText(turnOf([media]), 60_000, at(2)).requestedPricePoisha).toBeUndefined();
  });

  it('keeps free delivery in the hand-over screen without enabling a product offer', () => {
    const delivery = 'Can you deliver it for free?';
    expect(isDiscountRequest(delivery)).toBe(true);
    expect(
      burstText(turnOf([message(1, delivery, 1)]), 60000, at(2)).discountAskMessageId,
    ).toBeUndefined();
    const combined = message(2, 'Can you do BDT 850 and delivery for BDT 60?', 2);
    expect(burstText(turnOf([combined]), 60000, at(2)).requestedPricePoisha).toBe(85000);
  });

  it.each([
    ['৳৮৫০ টাকায় হবে?', 85000],
    ['850.50 taka e dite parben?', 85050],
    ['Can you do BDT 850?', 85000],
    ['৳850 or ৳900?', undefined],
    ['Size M, please', undefined],
  ])('reads the quoted amount in %s', (text, expected) => {
    expect(requestedDiscountPoisha(text)).toBe(expected);
  });
  it('cuts one huge message and keeps its end, so the ask survives', () => {
    const turn = turnOf([message(1, `${'x '.repeat(5000)} kurti ache?`, 1)]);
    const burst = burstText(turn, 60_000, at(2));
    expect(burst.texts[0]?.length).toBeLessThanOrEqual(600);
    expect(burst.texts[0]?.endsWith('kurti ache?')).toBe(true);
    expect(burst.screenTexts[0]?.length).toBeGreaterThan(5000);
  });

  it('never adds more than the burst length, newest messages first', () => {
    const turn = turnOf(
      Array.from({ length: 15 }, (_, index) => message(index, 'y'.repeat(900), 1)),
    );
    const burst = burstText(turn, 60_000, at(2));
    expect(burst.texts.join('').length).toBeLessThanOrEqual(3000 + 600);
    expect(burst.texts.length).toBeLessThan(15);
  });
});

describe('isFlood', () => {
  it('is true for 20 customer messages inside ten minutes, and not for fewer or slower ones', () => {
    const quick = Array.from({ length: 20 }, (_, index) => message(index, 'hi', 9 - index * 0.2));
    expect(isFlood(turnOf(quick))).toBe(true);
    expect(isFlood(turnOf(quick.slice(0, 19)))).toBe(false);
    const slow = Array.from({ length: 20 }, (_, index) => message(index, 'hi', 100 - index * 5));
    expect(isFlood(turnOf(slow))).toBe(false);
  });
});
