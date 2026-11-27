'use client';
import { ImageIcon, Paperclip, X } from 'lucide-react';
import { useRef } from 'react';

import { Button } from '@dakly/ui/button';

import { useUploadChatPhoto } from '../api/chat-photo';
import type { AttachedPhoto } from '../hooks/use-composer-drafts';

type AttachPhotoButtonProps = {
  conversationId: string;
  disabled: boolean;
  onAttach: (photo: AttachedPhoto) => void;
};

export function AttachPhotoButton({ conversationId, disabled, onAttach }: AttachPhotoButtonProps) {
  const input = useRef<HTMLInputElement>(null);
  const upload = useUploadChatPhoto(conversationId);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label="Photo to attach"
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file)
            upload.mutate(file, {
              onSuccess: (photo) => onAttach({ name: file.name, upload: photo }),
            });
        }}
      />
      <Button
        variant="secondary"
        type="button"
        size="sm"
        aria-label="Attach photo"
        disabled={disabled || upload.isPending}
        onClick={() => input.current?.click()}
      >
        <Paperclip aria-hidden="true" size={16} />
      </Button>
      {upload.error ? (
        <p role="alert" className="w-full text-sm text-danger">
          {upload.error.message}
        </p>
      ) : null}
    </>
  );
}

export function AttachedPhotoChip({
  photo,
  onRemove,
}: {
  photo: AttachedPhoto | undefined;
  onRemove: () => void;
}) {
  if (!photo) return null;
  return (
    <div className="mx-2 mb-1 inline-flex max-w-[calc(100%-1rem)] items-center gap-2 rounded-md bg-surface-muted px-2 py-1 text-sm">
      <ImageIcon aria-hidden="true" size={16} />
      <span className="min-w-0 truncate">{photo.name}</span>
      <button
        type="button"
        aria-label={`Remove ${photo.name}`}
        className="grid size-8 place-items-center rounded-sm hover:bg-surface"
        onClick={onRemove}
      >
        <X aria-hidden="true" size={14} />
      </button>
    </div>
  );
}
