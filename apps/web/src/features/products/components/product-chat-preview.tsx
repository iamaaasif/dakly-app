import Image from 'next/image';

import { buildProductCardElement } from '@dakly/contracts/product-card';
import type { ProductResponse } from '@dakly/contracts/products';
import { Card } from '@dakly/ui/card';

type ProductChatPreviewProps = { product: ProductResponse };

// Same builder as the AI's product card, so this preview cannot differ from what a customer gets.
export function ProductChatPreview({ product }: ProductChatPreviewProps) {
  const card = buildProductCardElement({
    productId: product.id,
    name: product.name,
    variants: product.variants.map((variant) => ({
      id: variant.id,
      title: variant.title,
      pricePoisha: variant.pricePoisha,
      inStock: !product.isStockTracked || variant.available > 0,
    })),
  });
  const photo = product.photos[0];
  return (
    <Card className="space-y-3">
      <h2 className="text-base font-semibold text-text">How it looks in chat</h2>
      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        {photo ? (
          <Image
            src={photo.url}
            alt={`${product.name} in chat`}
            width={320}
            height={320}
            unoptimized
            className="aspect-square w-full object-cover"
          />
        ) : (
          <p className="grid aspect-square place-items-center bg-surface-muted p-4 text-center text-sm text-text-muted">
            Add a photo and customers see it here.
          </p>
        )}
        <div className="space-y-1 p-3">
          <p className="font-semibold wrap-anywhere text-text">{card.title}</p>
          <p className="text-sm text-text-muted">{card.subtitle}</p>
        </div>
        <ul className="divide-y divide-border border-t border-border">
          {card.buttons.map((button) => (
            <li key={button.title} className="p-2.5 text-center text-sm font-medium text-action">
              {button.title}
            </li>
          ))}
        </ul>
      </div>
      <p className="text-xs text-text-muted">
        {product.status === 'hidden'
          ? 'Hidden products are not sent in chats. This is how it looks once shown.'
          : 'Dakly sends this card with the same name, price and photo. Sold-out sizes are never offered.'}
      </p>
    </Card>
  );
}
