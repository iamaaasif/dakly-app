import { Check, ImagePlus, Upload } from 'lucide-react';
import Image from 'next/image';
import { useRef, useState } from 'react';
import { useFormContext } from 'react-hook-form';

import type { CreatePostInput } from '@dakly/contracts/social';
import { Button } from '@dakly/ui/button';
import { cn } from '@dakly/ui/cn';

import { useProductPhotos } from '../../api/get-product-photos';
import { useUploadPostPhoto } from '../../api/upload-post-photo';
import type { usePostPreview } from './use-post-preview';
import type { UploadedPhotos } from './use-uploaded-photos';

const MAX_PHOTOS = 10;

type PostPhotosProps = { preview: Pick<ReturnType<typeof usePostPreview>, 'uploads' | 'networks'> };

// Photos come from Products or from the device; both end up as file ids on the post.
export function PostPhotos({ preview }: PostPhotosProps) {
  const { uploads, networks } = preview;
  const [open, setOpen] = useState(false);
  const choice = usePhotoChoice(uploads, open);
  const { chosen, limit, photos, upload, products } = choice;
  return (
    <section
      aria-labelledby="photos-heading"
      className="space-y-3 rounded-lg border border-border bg-surface p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="photos-heading" className="text-sm font-semibold">
            Photos
          </h2>
          <p className="text-xs text-text-muted">
            {chosen.length} of {limit} chosen
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            className="min-h-9 px-3 text-sm"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
          >
            <ImagePlus aria-hidden="true" size={16} strokeWidth={1.75} /> From products
          </Button>
          <UploadButton pending={upload.isPending} onFile={choice.handleFile} />
        </div>
      </div>
      <PhotoMessages
        pending={upload.isPending}
        error={upload.error?.message ?? products.error?.message}
        instagramRejects={networks.includes('instagram') && choice.hasNonJpeg}
      />
      {open && products.data && photos.length === 0 && (
        <p className="text-sm text-text-muted">
          Add photos to a product first, then choose them here.
        </p>
      )}
      <PhotoGrid
        photos={photos.filter(({ id }) => open || chosen.includes(id))}
        chosen={chosen}
        onToggle={choice.toggle}
      />
    </section>
  );
}

function usePhotoChoice(uploads: UploadedPhotos, open: boolean) {
  const { watch, setValue } = useFormContext<CreatePostInput>();
  const chosen = watch('mediaFileIds');
  const limit = watch('kind') === 'story' ? 1 : MAX_PHOTOS;
  const products = useProductPhotos(open || chosen.length > 0);
  const upload = useUploadPostPhoto();
  const choose = (next: string[]) =>
    setValue('mediaFileIds', next.slice(-limit), { shouldDirty: true });
  return {
    chosen,
    limit,
    products,
    upload,
    photos: [
      ...(products.data ?? []).flatMap(({ name, photos: list }) =>
        list.map((photo) => ({ ...photo, name })),
      ),
      ...uploads.photos.map(({ id, url }) => ({ id, url, name: 'Uploaded' })),
    ],
    hasNonJpeg: uploads.photos.some(
      ({ id, contentType }) => chosen.includes(id) && contentType !== 'image/jpeg',
    ),
    toggle: (id: string) =>
      choose(chosen.includes(id) ? chosen.filter((item) => item !== id) : [...chosen, id]),
    handleFile: (file: File) =>
      upload.mutate(file, {
        onSuccess: (photo) => {
          uploads.add(photo);
          choose([...chosen, photo.id]);
        },
      }),
  };
}

function UploadButton({ pending, onFile }: { pending: boolean; onFile: (file: File) => void }) {
  const chooser = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button
        variant="secondary"
        className="min-h-9 px-3 text-sm"
        disabled={pending}
        onClick={() => chooser.current?.click()}
      >
        <Upload aria-hidden="true" size={16} strokeWidth={1.75} /> Upload from device
      </Button>
      <input
        ref={chooser}
        type="file"
        aria-label="Photo file"
        className="sr-only"
        tabIndex={-1}
        accept="image/jpeg,image/png,image/webp"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFile(file);
          event.target.value = '';
        }}
      />
    </>
  );
}

type PhotoMessagesProps = { pending: boolean; error?: string; instagramRejects: boolean };

function PhotoMessages({ pending, error, instagramRejects }: PhotoMessagesProps) {
  return (
    <>
      {pending && (
        <p role="status" className="text-sm text-text-muted">
          Uploading photo…
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {instagramRejects && (
        <p role="status" className="text-sm text-danger">
          Instagram needs JPEG photos. Upload a JPEG or turn Instagram off for this post.
        </p>
      )}
    </>
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
