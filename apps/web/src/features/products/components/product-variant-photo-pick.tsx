import { Check } from 'lucide-react';
import Image from 'next/image';
import { useFormContext } from 'react-hook-form';

import type {
  ProductFormValues,
  ProductResponse,
  ProductVariantResponse,
} from '@dakly/contracts/products';
import { cn } from '@dakly/ui/cn';

type ProductVariantPhotoPickProps = {
  index: number;
  label: string;
  photos: ProductResponse['photos'];
  saved?: ProductVariantResponse;
};

// One click gives this size one of the product's photos. Until a photo is picked here the
// variant keeps whatever it has, so a size with its own photos is not changed by opening this.
export function ProductVariantPhotoPick({
  index,
  label,
  photos,
  saved,
}: ProductVariantPhotoPickProps) {
  const form = useFormContext<ProductFormValues>();
  const picked = form.watch(`variants.${index}.imageFileId`);
  const current = picked === undefined ? (saved?.imageFileId ?? null) : picked;
  if (!photos.length) return null;
  const choose = (fileId: string | null) =>
    form.setValue(`variants.${index}.imageFileId`, fileId, { shouldDirty: true });
  return (
    <div role="group" aria-label={`Photo for ${label}`} className="space-y-2">
      <p className="text-sm font-medium text-text">Photo for this variant</p>
      <ul className="flex flex-wrap gap-2">
        {photos.map(({ id, url }, position) => (
          <li key={id}>
            <button
              type="button"
              aria-pressed={current === id}
              aria-label={`Use photo ${position + 1}`}
              onClick={() => choose(current === id ? null : id)}
              className={cn(
                'relative block size-14 overflow-hidden rounded-md border-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
                current === id ? 'border-primary' : 'border-transparent hover:border-border-strong',
              )}
            >
              <Image
                src={url}
                alt=""
                width={56}
                height={56}
                unoptimized
                className="size-full object-cover"
              />
              {current === id ? (
                <span className="absolute right-0.5 bottom-0.5 grid size-4 place-items-center rounded-full bg-primary text-on-primary">
                  <Check aria-hidden="true" size={10} strokeWidth={3} />
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
