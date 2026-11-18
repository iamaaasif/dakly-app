'use client';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import Image from 'next/image';
import { useId, useRef, useState, type ReactNode, type RefObject } from 'react';

import { MAX_PRODUCT_PHOTOS, type ProductResponse } from '@dakly/contracts/products';
import { Button } from '@dakly/ui/button';
import { Label } from '@dakly/ui/label';

import { useRemoveProductPhoto } from '../api/remove-product-photo';
import { useReorderProductPhotos } from '../api/reorder-product-photos';
import { useUploadProductPhoto } from '../api/upload-product-photo';
import { SessionDialog } from '@/components/session-dialog';
import { useSessionContext } from '@/lib/session-context';

type ProductPhotosProps = { product: Pick<ProductResponse, 'id' | 'name' | 'photos'> };
export function ProductPhotos({ product }: ProductPhotosProps) {
  const { data } = useSessionContext();
  return (
    <section className="space-y-4" aria-label="Product photos">
      <h2 className="font-semibold">Photos ({product.photos.length})</h2>
      {data?.currentStore?.canEditProducts ? (
        <EditablePhotos product={product} />
      ) : (
        <PhotoList product={product} />
      )}
    </section>
  );
}

function EditablePhotos({ product }: ProductPhotosProps) {
  const upload = useUploadProductPhoto(product.id);
  const reorder = useReorderProductPhotos(product.id);
  const remove = useRemoveProductPhoto(product.id);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const chooser = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const busy = upload.isPending || reorder.isPending || remove.isPending;
  const error = upload.error ?? reorder.error;
  function handleMoveEarlier(index: number, onMoved: () => void) {
    upload.reset();
    const fileIds = product.photos.map((photo) => photo.id);
    fileIds.splice(index - 1, 0, fileIds.splice(index, 1)[0]!);
    reorder.mutate({ fileIds }, { onSuccess: () => requestAnimationFrame(onMoved) });
  }
  function handleUpload(file: File) {
    reorder.reset();
    upload.mutate(file);
  }
  function handleRequestRemoval(id: string) {
    remove.reset();
    setRemoveId(id);
  }
  function handleRemove(id: string) {
    remove.mutate(id, {
      onSuccess: () => {
        setRemoveId(null);
        requestAnimationFrame(() => chooser.current?.focus());
      },
    });
  }
  return (
    <>
      <PhotoList
        product={product}
        actions={{ disabled: busy, onMove: handleMoveEarlier, onRemove: handleRequestRemoval }}
      >
        {product.photos.length < MAX_PRODUCT_PHOTOS ? (
          <PhotoInput id={inputId} input={chooser} disabled={busy} onFile={handleUpload} />
        ) : null}
      </PhotoList>
      {upload.isPending ? <p role="status">Uploading photo…</p> : null}
      {error ? (
        <p role="alert" className="text-danger">
          {error.message}
        </p>
      ) : null}
      {removeId ? (
        <RemovePhotoDialog
          productName={product.name}
          error={remove.error?.message}
          pending={remove.isPending}
          onClose={() => setRemoveId(null)}
          onRemove={() => handleRemove(removeId)}
        />
      ) : null}
    </>
  );
}

type PhotoListProps = ProductPhotosProps & {
  children?: ReactNode;
  actions?: {
    disabled: boolean;
    onMove: (index: number, onMoved: () => void) => void;
    onRemove: (id: string) => void;
  };
};
function PhotoList({ product, actions, children }: PhotoListProps) {
  if (!product.photos.length && !children) return <p className="text-text-muted">No photos yet.</p>;
  return (
    <ul className="flex flex-wrap gap-4">
      {product.photos.map((photo, index) => (
        <PhotoEntry
          key={photo.id}
          name={product.name}
          photo={photo}
          index={index}
          actions={actions}
        />
      ))}
      {children ? <li>{children}</li> : null}
    </ul>
  );
}

type PhotoEntryProps = {
  name: string;
  photo: ProductResponse['photos'][number];
  index: number;
  actions: PhotoListProps['actions'];
};
function PhotoEntry({ name, photo, index, actions }: PhotoEntryProps) {
  const move = useRef<HTMLButtonElement>(null);
  const remove = useRef<HTMLButtonElement>(null);
  function handleMove() {
    const focusTarget = index === 1 ? remove : move;
    actions?.onMove(index, () => focusTarget.current?.focus());
  }
  return (
    <li className="space-y-2">
      <Image
        src={photo.url}
        alt={`${name} photo ${index + 1}`}
        width={80}
        height={80}
        unoptimized
        className="size-20 rounded-md object-cover"
      />
      {actions ? (
        <div className="flex gap-2">
          {index > 0 ? (
            <Button
              ref={move}
              variant="secondary"
              className="px-2"
              disabled={actions.disabled}
              aria-label={`Move photo ${index + 1} earlier`}
              onClick={handleMove}
            >
              <ArrowLeft aria-hidden="true" size={16} strokeWidth={1.75} />
            </Button>
          ) : null}
          <Button
            ref={remove}
            variant="secondary"
            className="px-2"
            disabled={actions.disabled}
            aria-label={`Remove photo ${index + 1}`}
            onClick={() => actions.onRemove(photo.id)}
          >
            <Trash2 aria-hidden="true" size={16} strokeWidth={1.75} />
          </Button>
        </div>
      ) : null}
    </li>
  );
}

type PhotoInputProps = {
  id: string;
  input: RefObject<HTMLInputElement | null>;
  disabled: boolean;
  onFile: (file: File) => void;
};
function PhotoInput({ id, input, disabled, onFile }: PhotoInputProps) {
  return (
    <div className="space-y-3">
      <Label
        htmlFor={id}
        className="flex size-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-input-border bg-surface-muted text-sm focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus has-disabled:cursor-not-allowed has-disabled:opacity-50"
      >
        <Plus aria-hidden="true" size={16} strokeWidth={1.75} />
        Add photo
        <input
          ref={input}
          id={id}
          type="file"
          className="sr-only"
          accept="image/jpeg,image/png,image/webp"
          aria-describedby={`${id}-hint`}
          disabled={disabled}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onFile(file);
            event.target.value = '';
          }}
        />
      </Label>
      <span id={`${id}-hint`} className="sr-only">
        JPEG, PNG or WebP, up to 5 MB. Up to {MAX_PRODUCT_PHOTOS} photos.
      </span>
    </div>
  );
}

type RemovePhotoDialogProps = {
  productName: string;
  error?: string;
  pending: boolean;
  onClose: () => void;
  onRemove: () => void;
};
function RemovePhotoDialog({
  productName,
  error,
  pending,
  onClose,
  onRemove,
}: RemovePhotoDialogProps) {
  return (
    <SessionDialog
      title={`Remove photo from ${productName}?`}
      open
      closeDisabled={pending}
      onClose={onClose}
    >
      {error ? (
        <p role="alert" className="mb-4 text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" disabled={pending} onClick={onClose}>
          Cancel
        </Button>
        <Button variant="danger" loading={pending} onClick={onRemove}>
          Remove photo
        </Button>
      </div>
    </SessionDialog>
  );
}
