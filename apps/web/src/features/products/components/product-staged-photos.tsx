'use client';
import { Camera, GripVertical, ImagePlus, MoreHorizontal, RotateCw } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useRef, useState, type DragEvent } from 'react';

import { MAX_PRODUCT_PHOTOS } from '@dakly/contracts/products';
import { Button } from '@dakly/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@dakly/ui/dropdown-menu';

import type { StagedPhoto, StagedPhotos } from '../use-staged-photos';

const reorderType = 'application/x-dakly-photo';
const imageAccept = 'image/jpeg,image/png,image/webp';

function hasFiles(event: { dataTransfer: DataTransfer | null }) {
  return event.dataTransfer?.types.includes('Files') ?? false;
}

function usePastedPhotos(add: (files: File[]) => void) {
  useEffect(() => {
    function handlePaste(event: ClipboardEvent) {
      const files = [...(event.clipboardData?.files ?? [])];
      if (files.some(({ type }) => type.startsWith('image/'))) add(files);
    }
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [add]);
}

function useFileDrop(add: (files: File[]) => void) {
  const [dropping, setDropping] = useState(false);
  const handlers = {
    onDragOver(event: DragEvent<HTMLElement>) {
      if (!hasFiles(event)) return;
      event.preventDefault();
      setDropping(true);
    },
    onDragLeave(event: DragEvent<HTMLElement>) {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropping(false);
    },
    onDrop(event: DragEvent<HTMLElement>) {
      if (!hasFiles(event)) return;
      event.preventDefault();
      setDropping(false);
      add([...event.dataTransfer.files]);
    },
  };
  return [dropping, handlers] as const;
}

// The Media card of a product that is not saved yet. Photos upload at once and are attached on Create.
export function ProductStagedPhotos({ staged }: { staged: StagedPhotos }) {
  const { photos, add } = staged;
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dropping, dropHandlers] = useFileDrop(add);
  usePastedPhotos(add);

  return (
    <section
      aria-label="Product photos"
      className={`space-y-3 rounded-lg transition-colors ${dropping ? 'bg-primary-soft' : ''}`}
      {...dropHandlers}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-text">Media</h2>
        <span className="text-xs text-text-muted">
          {photos.length} of {MAX_PRODUCT_PHOTOS}
        </span>
      </div>
      <ul className="flex flex-wrap gap-3">
        {photos.map((photo, index) => (
          <PhotoTile
            key={photo.key}
            photo={photo}
            index={index}
            staged={staged}
            dragKey={dragKey}
            onDragKey={setDragKey}
          />
        ))}
        {photos.length < MAX_PRODUCT_PHOTOS ? (
          <li>
            <AddTile onFiles={add} first={photos.length === 0} />
          </li>
        ) : null}
      </ul>
      <p className="text-xs text-text-muted">
        Drop photos here, paste with Ctrl+V, or choose files. JPEG, PNG or WebP. The first photo is
        the cover.
      </p>
      <PhotoNotices staged={staged} />
    </section>
  );
}

function AddTile({ onFiles, first }: { onFiles: (files: File[]) => void; first: boolean }) {
  const camera = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col gap-2">
      <label className="flex size-27 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-input-border bg-surface-muted text-sm font-medium text-text-muted focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus hover:border-primary hover:text-action">
        <ImagePlus aria-hidden="true" size={22} strokeWidth={1.75} className="text-primary" />
        {first ? 'Add photos' : 'Add'}
        <input
          type="file"
          multiple
          aria-label="Add photos"
          className="sr-only"
          accept={imageAccept}
          onChange={(event) => {
            onFiles([...(event.target.files ?? [])]);
            event.target.value = '';
          }}
        />
      </label>
      <Button
        type="button"
        variant="secondary"
        className="md:hidden"
        onClick={() => camera.current?.click()}
      >
        <Camera aria-hidden="true" size={16} strokeWidth={1.75} />
        From phone camera
      </Button>
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        aria-label="Take a photo"
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          onFiles([...(event.target.files ?? [])]);
          event.target.value = '';
        }}
      />
    </div>
  );
}

type PhotoTileProps = {
  photo: StagedPhoto;
  index: number;
  staged: StagedPhotos;
  dragKey: string | null;
  onDragKey: (key: string | null) => void;
};

function PhotoTile({ photo, index, staged, dragKey, onDragKey }: PhotoTileProps) {
  const label = `Photo ${index + 1}`;
  return (
    <li
      draggable
      className={`motion-enter group relative size-27 cursor-grab overflow-hidden rounded-lg border border-border bg-surface-muted ${dragKey === photo.key ? 'opacity-50' : ''}`}
      onDragStart={(event) => {
        event.dataTransfer.setData(reorderType, photo.key);
        event.dataTransfer.effectAllowed = 'move';
        onDragKey(photo.key);
      }}
      onDragEnd={() => onDragKey(null)}
      onDragOver={(event) => {
        if (dragKey && !hasFiles(event)) event.preventDefault();
      }}
      onDrop={(event) => {
        const moved = event.dataTransfer.getData(reorderType);
        if (!moved) return;
        event.preventDefault();
        event.stopPropagation();
        staged.moveTo(moved, photo.key);
        onDragKey(null);
      }}
    >
      <Image
        src={photo.previewUrl}
        alt={label}
        width={108}
        height={108}
        unoptimized
        draggable={false}
        className="size-full object-cover"
      />
      {index === 0 ? (
        <span className="absolute top-1.5 left-1.5 rounded-md bg-inverse px-1.5 py-0.5 text-xs font-medium text-on-primary">
          Cover
        </span>
      ) : null}
      <GripVertical
        aria-hidden="true"
        size={16}
        className="absolute bottom-1.5 left-1 text-on-primary opacity-0 drop-shadow transition-opacity group-hover:opacity-100"
      />
      <TileStatus photo={photo} retry={() => staged.retry(photo.key)} />
      <TileMenu label={label} index={index} staged={staged} />
    </li>
  );
}

function TileMenu({
  label,
  index,
  staged,
}: {
  label: string;
  index: number;
  staged: StagedPhotos;
}) {
  const { photos, moveTo } = staged;
  const photo = photos[index]!;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`${label} options`}
          className="shadow-sm absolute top-1 right-1 inline-flex size-8 items-center justify-center rounded-md bg-surface text-text focus-visible:outline-2 focus-visible:outline-focus"
        >
          <MoreHorizontal aria-hidden="true" size={16} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {index > 0 ? (
          <DropdownMenuItem onSelect={() => moveTo(photo.key, photos[0]!.key)}>
            Make cover
          </DropdownMenuItem>
        ) : null}
        {index > 0 ? (
          <DropdownMenuItem onSelect={() => moveTo(photo.key, photos[index - 1]!.key)}>
            Move earlier
          </DropdownMenuItem>
        ) : null}
        {index < photos.length - 1 ? (
          <DropdownMenuItem onSelect={() => moveTo(photo.key, photos[index + 1]!.key)}>
            Move later
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem className="text-danger" onSelect={() => staged.remove(photo.key)}>
          Remove
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TileStatus({ photo, retry }: { photo: StagedPhoto; retry: () => void }) {
  if (photo.status === 'uploading')
    return (
      <div role="status" className="absolute inset-x-0 bottom-0 bg-inverse/70 px-2 py-1.5">
        <span className="sr-only">Uploading</span>
        <div className="h-1 overflow-hidden rounded-full bg-on-primary/30">
          <div className="motion-shimmer h-full w-full bg-primary" />
        </div>
      </div>
    );
  if (photo.status === 'failed')
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-inverse/70 p-1 text-center text-xs text-on-primary">
        <span>Upload failed</span>
        <Button type="button" variant="secondary" className="h-7 px-2 text-xs" onClick={retry}>
          <RotateCw aria-hidden="true" size={12} />
          Retry
        </Button>
      </div>
    );
  return null;
}

function PhotoNotices({ staged }: { staged: StagedPhotos }) {
  return (
    <>
      {staged.hasRemoved ? (
        <p role="status" className="flex items-center gap-3 text-sm text-text">
          Photo removed.
          <Button type="button" variant="secondary" onClick={staged.undoRemove}>
            Undo
          </Button>
        </p>
      ) : null}
      {staged.notice ? (
        <p role="status" className="text-sm text-warning">
          {staged.notice}
        </p>
      ) : null}
      {staged.failed ? (
        <p role="alert" className="text-sm text-danger">
          {staged.failed === 1 ? '1 photo' : `${staged.failed} photos`} did not upload. Retry or
          remove before you create the product.
        </p>
      ) : null}
    </>
  );
}
