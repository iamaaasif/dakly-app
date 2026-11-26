'use client';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react';

import {
  MAX_PRODUCT_PHOTOS,
  type ProductResponse,
  type ProductVariantResponse,
} from '@dakly/contracts/products';
import { Button } from '@dakly/ui/button';
import { Label } from '@dakly/ui/label';
import { SheetDialog } from '@dakly/ui/sheet';

import { useRemoveProductPhoto } from '../api/remove-product-photo';
import { useReorderProductPhotos } from '../api/reorder-product-photos';
import { useUploadProductPhoto } from '../api/upload-product-photo';
import { SessionDialog } from '@/components/session-dialog';
import { useSessionContext } from '@/lib/session-context';

type ProductPhotosProps = {
  product: Pick<ProductResponse, 'id' | 'name' | 'photos'>;
  // Photos of one variant; without it the product's own photos are shown.
  variant?: Pick<ProductVariantResponse, 'id' | 'title' | 'photos'>;
  readOnly?: boolean;
};
export function ProductPhotos({ product, variant, readOnly }: ProductPhotosProps) {
  const { data } = useSessionContext();
  const scope = variant
    ? {
        id: product.id,
        variantId: variant.id,
        name: `${product.name} ${variant.title}`,
        photos: variant.photos,
      }
    : { id: product.id, variantId: undefined, name: product.name, photos: product.photos };
  return (
    <section
      className="space-y-4"
      aria-label={variant ? `${variant.title} photos` : 'Product photos'}
    >
      <div className="flex items-center justify-between">
        {variant ? (
          <h3 className="text-sm font-semibold text-text">{variant.title}</h3>
        ) : (
          <h2 className="text-base font-semibold text-text">Media</h2>
        )}
        <span className="text-xs text-text-muted">
          {scope.photos.length} photo{scope.photos.length === 1 ? '' : 's'}
        </span>
      </div>
      {!readOnly && data?.currentStore?.canEditProducts ? (
        <EditablePhotos scope={scope} />
      ) : (
        <PhotoList scope={scope} />
      )}
      <VariantPhotoFallback scope={scope} />
    </section>
  );
}

function VariantPhotoFallback({ scope }: { scope: PhotoScope }) {
  if (!scope.variantId || scope.photos.length) return null;
  return <p className="text-xs text-text-muted">No photos. The product photos show instead.</p>;
}

type PhotoScope = {
  id: string;
  variantId: string | undefined;
  name: string;
  photos: ProductResponse['photos'];
};

function EditablePhotos({ scope }: { scope: PhotoScope }) {
  const upload = useUploadProductPhoto(scope.id, scope.variantId);
  const reorder = useReorderProductPhotos(scope.id, scope.variantId);
  const remove = useRemoveProductPhoto(scope.id, scope.variantId);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const chooser = useRef<HTMLInputElement>(null);
  const removeOpener = useRef<HTMLButtonElement>(null);
  const inputId = useId();
  const busy = upload.isPending || reorder.isPending || remove.isPending;
  function handleMoveEarlier(index: number, onMoved: () => void) {
    upload.reset();
    const fileIds = scope.photos.map((photo) => photo.id);
    fileIds.splice(index - 1, 0, fileIds.splice(index, 1)[0]!);
    reorder.mutate({ fileIds }, { onSuccess: onMoved });
  }
  function handleUpload(file: File) {
    reorder.reset();
    upload.mutate(file);
  }
  function handleRequestRemoval(id: string, opener: HTMLButtonElement) {
    removeOpener.current = opener;
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
        scope={scope}
        actions={{ disabled: busy, onMove: handleMoveEarlier, onRemove: handleRequestRemoval }}
      >
        {scope.photos.length < MAX_PRODUCT_PHOTOS ? (
          <PhotoInput id={inputId} input={chooser} disabled={busy} onFile={handleUpload} />
        ) : null}
      </PhotoList>
      <PhotoUploadStatus upload={upload} reorderError={reorder.error} disabled={busy} />
      {removeId ? (
        <RemovePhotoDialog
          productName={scope.name}
          error={remove.error?.message}
          pending={remove.isPending}
          inSheet={Boolean(scope.variantId)}
          onClose={() => {
            setRemoveId(null);
            requestAnimationFrame(() => removeOpener.current?.focus());
          }}
          onRemove={() => handleRemove(removeId)}
        />
      ) : null}
    </>
  );
}

type PhotoUploadStatusProps = {
  upload: ReturnType<typeof useUploadProductPhoto>;
  reorderError: Error | null;
  disabled: boolean;
};

function PhotoUploadStatus({ upload, reorderError, disabled }: PhotoUploadStatusProps) {
  const error = upload.error ?? reorderError;
  const failedFile = upload.error && upload.variables;
  if (upload.isPending) return <p role="status">Uploading photo…</p>;
  if (!error) return null;
  return (
    <>
      <p role="alert" className="text-danger">
        {error.message}
      </p>
      {failedFile && (
        <Button variant="secondary" disabled={disabled} onClick={() => upload.mutate(failedFile)}>
          Retry upload
        </Button>
      )}
    </>
  );
}

type PhotoListProps = {
  scope: PhotoScope;
  children?: ReactNode;
  actions?: {
    disabled: boolean;
    onMove: (index: number, onMoved: () => void) => void;
    onRemove: (id: string, opener: HTMLButtonElement) => void;
  };
};
function PhotoList({ scope, actions, children }: PhotoListProps) {
  if (!scope.photos.length && !children) return <p className="text-text-muted">No photos yet.</p>;
  return (
    <ul className="flex flex-wrap gap-4">
      {scope.photos.map((photo, index) => (
        <PhotoEntry
          key={photo.id}
          name={scope.name}
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
  const [restoreFocus, setRestoreFocus] = useState(false);
  const disabled = actions?.disabled;
  useEffect(() => {
    if (!restoreFocus || disabled) return;
    (index === 0 ? remove : move).current?.focus();
    setRestoreFocus(false);
  }, [disabled, index, restoreFocus]);
  function handleMove() {
    actions?.onMove(index, () => setRestoreFocus(true));
  }
  return (
    <li className="space-y-2">
      <Image
        src={photo.url}
        alt={`${name} photo ${index + 1}`}
        width={80}
        height={80}
        unoptimized
        className="size-20 rounded-lg object-cover"
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
            onClick={(event) => actions.onRemove(photo.id, event.currentTarget)}
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
        className="flex size-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-input-border bg-surface-muted text-xs font-medium text-text-muted focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus hover:border-text hover:text-text has-disabled:cursor-not-allowed has-disabled:opacity-50"
      >
        <Plus aria-hidden="true" size={16} strokeWidth={1.75} />
        Add
        <input
          ref={input}
          id={id}
          type="file"
          aria-label="Add photo"
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
  inSheet: boolean;
  error?: string;
  pending: boolean;
  onClose: () => void;
  onRemove: () => void;
};
function RemovePhotoDialog(props: RemovePhotoDialogProps) {
  const { productName, inSheet, error, pending, onClose, onRemove } = props;
  const title = `Remove photo from ${productName}?`;
  const content = (
    <>
      {error && (
        <p role="alert" className="mb-4 text-danger">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" disabled={pending} onClick={onClose}>
          Cancel
        </Button>
        <Button variant="danger" loading={pending} onClick={onRemove}>
          Remove photo
        </Button>
      </div>
    </>
  );
  if (inSheet)
    return (
      <SheetDialog title={title} open pending={pending} onOpenChange={onClose}>
        {content}
      </SheetDialog>
    );
  return (
    <SessionDialog title={title} open closeDisabled={pending} onClose={onClose}>
      {content}
    </SessionDialog>
  );
}
