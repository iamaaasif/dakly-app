'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

import { MAX_PRODUCT_PHOTOS, type ProductPhotoResponse } from '@dakly/contracts/products';

import { uploadProductPhotoFile } from './api/upload-product-photo';
import { shrinkPhoto } from './shrink-photo';
import { useStoreRequest } from '@/lib/store-request';

export type StagedPhoto = {
  key: string;
  previewUrl: string;
  file: File;
  status: 'uploading' | 'done' | 'failed';
  fileId?: string;
  error?: string;
  // A removed photo stays in the list for a few seconds so Undo puts it back in place.
  removed: boolean;
};

const UNDO_MS = 5000;
const acceptedTypes = ['image/jpeg', 'image/png', 'image/webp'];

// The list the editor shows: updates by key, a removal that can be undone, and reordering.
function useStagedList() {
  const [photos, setPhotos] = useState<StagedPhoto[]>([]);
  const latest = useRef(photos);
  latest.current = photos;
  const undoTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(
    () => () => {
      clearTimeout(undoTimer.current);
      latest.current.forEach(({ previewUrl }) => URL.revokeObjectURL(previewUrl));
    },
    [],
  );

  const change = useCallback(
    (key: string, patch: Partial<StagedPhoto>) =>
      setPhotos((current) => current.map((p) => (p.key === key ? { ...p, ...patch } : p))),
    [],
  );
  const append = useCallback(
    (created: StagedPhoto[]) => setPhotos((current) => [...current, ...created]),
    [],
  );
  const remove = (key: string) => {
    change(key, { removed: true });
    clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => {
      setPhotos((current) => {
        current.filter((p) => p.removed).forEach((p) => URL.revokeObjectURL(p.previewUrl));
        return current.filter((p) => !p.removed);
      });
    }, UNDO_MS);
  };
  const undoRemove = () => {
    clearTimeout(undoTimer.current);
    setPhotos((current) => current.map((p) => ({ ...p, removed: false })));
  };
  // Moves one photo to the place of another, so the first one is the cover.
  const moveTo = (key: string, targetKey: string) =>
    setPhotos((current) => {
      const from = current.findIndex((p) => p.key === key);
      const to = current.findIndex((p) => p.key === targetKey);
      if (from < 0 || to < 0 || from === to) return current;
      const next = [...current];
      next.splice(to, 0, next.splice(from, 1)[0]!);
      return next;
    });
  return { all: photos, latest, change, append, remove, undoRemove, moveTo };
}

function useUploadStaged(change: (key: string, patch: Partial<StagedPhoto>) => void) {
  const { request } = useStoreRequest();
  return useCallback(
    async (key: string, file: File) => {
      change(key, { status: 'uploading', error: undefined });
      try {
        const saved = await uploadProductPhotoFile<ProductPhotoResponse>(
          request,
          '/product-media',
          await shrinkPhoto(file),
        );
        change(key, { status: 'done', fileId: saved.id });
      } catch (error) {
        change(key, {
          status: 'failed',
          error: error instanceof Error ? error.message : 'The photo could not upload.',
        });
      }
    },
    [change, request],
  );
}

export function useStagedPhotos() {
  const list = useStagedList();
  const { change, latest, append } = list;
  const [notice, setNotice] = useState<string | null>(null);
  const keyCount = useRef(0);

  const upload = useUploadStaged(change);

  const add = useCallback(
    (files: File[]) => {
      const images = files.filter(({ type }) => acceptedTypes.includes(type));
      const room = MAX_PRODUCT_PHOTOS - latest.current.filter((p) => !p.removed).length;
      const accepted = images.slice(0, Math.max(room, 0));
      setNotice(
        files.length > accepted.length
          ? `Added ${accepted.length}. Photos must be JPEG, PNG or WebP, and a product holds up to ${MAX_PRODUCT_PHOTOS}.`
          : null,
      );
      const created = accepted.map((file): StagedPhoto => {
        keyCount.current += 1;
        return {
          key: `photo-${keyCount.current}`,
          previewUrl: URL.createObjectURL(file),
          file,
          status: 'uploading',
          removed: false,
        };
      });
      append(created);
      created.forEach(({ key, file }) => void upload(key, file));
    },
    [append, latest, upload],
  );

  const retry = (key: string) => {
    const photo = latest.current.find((p) => p.key === key);
    if (photo) void upload(key, photo.file);
  };

  const visible = list.all.filter((p) => !p.removed);
  return {
    photos: visible,
    hasRemoved: list.all.some((p) => p.removed),
    notice,
    uploading: visible.filter((p) => p.status === 'uploading').length,
    failed: visible.filter((p) => p.status === 'failed').length,
    fileIds: visible.flatMap((p) => (p.fileId ? [p.fileId] : [])),
    add,
    retry,
    remove: list.remove,
    undoRemove: list.undoRemove,
    moveTo: list.moveTo,
  };
}

export type StagedPhotos = ReturnType<typeof useStagedPhotos>;
