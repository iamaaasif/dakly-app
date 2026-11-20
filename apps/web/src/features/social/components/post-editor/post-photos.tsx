import { Check, ImagePlus } from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';
import { useFormContext } from 'react-hook-form';

import type { CreatePostInput } from '@dakly/contracts/social';
import { Button } from '@dakly/ui/button';
import { cn } from '@dakly/ui/cn';

import { useProductPhotos } from '../../api/get-product-photos';

const MAX_PHOTOS = 10;

// Photos come from Products; uploading a new photo for a post waits for a post media upload API.
export function PostPhotos() {
  const { watch, setValue } = useFormContext<CreatePostInput>();
  const chosen = watch('mediaFileIds');
  const limit = watch('kind') === 'story' ? 1 : MAX_PHOTOS;
  const [open, setOpen] = useState(false);
  const products = useProductPhotos(open || chosen.length > 0);
  const photos = (products.data ?? []).flatMap(({ name, photos: list }) =>
    list.map((photo) => ({ ...photo, name })),
  );
  const toggle = (id: string) =>
    setValue(
      'mediaFileIds',
      chosen.includes(id) ? chosen.filter((item) => item !== id) : [...chosen, id].slice(-limit),
      { shouldDirty: true },
    );
  const shown = photos.filter(({ id }) => open || chosen.includes(id));
  return (
    <section
      aria-labelledby="photos-heading"
      className="space-y-3 rounded-lg border border-border bg-surface p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 id="photos-heading" className="text-sm font-semibold">
            Photos
          </h2>
          <p className="text-xs text-text-muted">
            {chosen.length} of {limit} chosen from your products
          </p>
        </div>
        <Button
          variant="secondary"
          className="min-h-9 px-3 text-sm"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
        >
          <ImagePlus aria-hidden="true" size={16} strokeWidth={1.75} /> From products
        </Button>
      </div>
      {products.isError && (
        <p role="alert" className="text-sm text-danger">
          {products.error.message}
        </p>
      )}
      {open && products.data && photos.length === 0 && (
        <p className="text-sm text-text-muted">
          Add photos to a product first, then choose them here.
        </p>
      )}
      <PhotoGrid photos={shown} chosen={chosen} onToggle={toggle} />
    </section>
  );
}

type PhotoGridProps = {
  photos: { id: string; url: string; name: string }[];
  chosen: string[];
  onToggle: (id: string) => void;
};

function PhotoGrid({ photos, chosen, onToggle }: PhotoGridProps) {
  if (photos.length === 0) return null;
  return (
    <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6">
      {photos.map((photo) => {
        const picked = chosen.includes(photo.id);
        return (
          <li key={photo.id}>
            <button
              type="button"
              aria-pressed={picked}
              aria-label={`${photo.name} photo`}
              onClick={() => onToggle(photo.id)}
              className={cn(
                'relative block aspect-square w-full overflow-hidden rounded-md border-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
                picked ? 'border-primary' : 'border-transparent',
              )}
            >
              <Image
                src={photo.url}
                alt=""
                width={96}
                height={96}
                unoptimized
                className="size-full object-cover"
              />
              {picked && (
                <span
                  aria-hidden="true"
                  className="absolute top-1 right-1 grid size-5 place-items-center rounded-full bg-action text-on-primary"
                >
                  <Check size={12} strokeWidth={2} />
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
