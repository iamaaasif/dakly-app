import { productCardMaxElements } from '@dakly/contracts/product-card';

import type { ProductCard } from './sales-agent.service';

// With buttons on, the first 10 products go out as one swipeable row. A product that cannot be
// drawn as a card, or any product past Meta's limit, goes out as photo and text.
export function cardMessages(cards: ProductCard[], style: 'buttons' | 'text') {
  const row = style === 'buttons' ? cards.slice(0, productCardMaxElements) : [];
  const elements = row.flatMap(({ element }) => (element ? [element] : []));
  const isRow = row.length > 0 && elements.length === row.length;
  const messages = isRow
    ? [
        {
          content: row.map(({ text }) => text).join('\n\n'),
          key: 'card-0',
          image: row[0]?.image,
          card: { elements },
        },
      ]
    : [];
  const sent = isRow ? row.length : 0;
  return [
    ...messages,
    ...cards.slice(sent).map(({ text, image }, index) => ({
      content: text,
      key: `card-${sent + index}`,
      image,
      card: undefined,
    })),
  ];
}
