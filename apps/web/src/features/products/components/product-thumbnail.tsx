import Image from 'next/image';

import type { ProductResponse } from '@dakly/contracts/products';

type ProductThumbnailProps = {
  product: Pick<ProductResponse, 'name' | 'photos'>;
};

export function ProductThumbnail({ product }: ProductThumbnailProps) {
  if (product.photos[0]) {
    return (
      <Image
        src={product.photos[0].url}
        alt={product.name}
        width={48}
        height={48}
        unoptimized
        className="size-12 shrink-0 rounded-lg object-cover"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="grid size-12 shrink-0 place-items-center rounded-lg bg-surface-muted text-md font-semibold text-text-muted"
    >
      {product.name.slice(0, 1)}
    </span>
  );
}
