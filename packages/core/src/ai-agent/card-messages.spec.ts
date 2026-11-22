import { describe, expect, it } from 'vitest';

import { buildProductCardElement } from '@dakly/contracts/product-card';

import { cardMessages } from './card-messages';

const card = (name: string, drawn = true) => ({
  text: name,
  element: drawn
    ? buildProductCardElement({
        productId: name,
        name,
        variants: [{ id: `${name}-m`, title: 'M', pricePoisha: 125000, inStock: true }],
      })
    : undefined,
});

describe('cardMessages', () => {
  it('sends one swipeable row for several products when buttons are on', () => {
    const messages = cardMessages([card('পাঞ্জাবি'), card('Saree'), card('Eid থ্রি-পিস')], 'buttons');
    expect(messages).toHaveLength(1);
    expect(messages[0]?.card?.elements.map(({ title }) => title)).toEqual([
      'পাঞ্জাবি',
      'Saree',
      'Eid থ্রি-পিস',
    ]);
  });

  it('sends photo and text per product when buttons are off', () => {
    const messages = cardMessages([card('পাঞ্জাবি'), card('Saree')], 'text');
    expect(messages.map(({ card: sent }) => sent)).toEqual([undefined, undefined]);
    expect(messages.map(({ key }) => key)).toEqual(['card-0', 'card-1']);
  });

  it('falls back to text when a product cannot be drawn as a card', () => {
    const messages = cardMessages([card('পাঞ্জাবি'), card('Saree', false)], 'buttons');
    expect(messages.every(({ card: sent }) => sent === undefined)).toBe(true);
    expect(messages).toHaveLength(2);
  });

  it('keeps the row to 10 and sends the rest as text', () => {
    const cards = Array.from({ length: 12 }, (_, index) => card(`Product ${index}`));
    const messages = cardMessages(cards, 'buttons');
    expect(messages[0]?.card?.elements).toHaveLength(10);
    expect(messages.slice(1).map(({ content }) => content)).toEqual(['Product 10', 'Product 11']);
  });
});
