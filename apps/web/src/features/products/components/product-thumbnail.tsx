import Image from 'next/image';

import type { ProductResponse } from '@dakly/contracts/products';
import { cn } from '@dakly/ui/cn';

import { productTileTone } from '../product-tile-tone';

type ProductThumbnailProps = {
  product: Pick<ProductResponse, 'name' | 'photos'>;
};

export function ProductThumbnail({ product }: ProductThumbnailProps) {
  if (product.photos[0]) {
    return (
      <Image
        src={product.photos[0].url}
        alt={product.name}
        width={44}
        height={44}
        unoptimized
        loading="lazy"
        className="size-11 shrink-0 rounded-lg object-cover"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid size-11 shrink-0 place-items-center rounded-lg text-md font-semibold',
        productTileTone(product.name),
      )}
    >
      {product.name.slice(0, 1).toUpperCase()}
    </span>
  );
}
