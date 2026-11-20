'use client';
import { X } from 'lucide-react';
import { useContext, useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';

import { cn } from '@dakly/ui/cn';

import { SessionInteraction } from '@/components/session-interaction';

type ProductDialogProps = {
  title: string;
  open: boolean;
  className?: string;
  onClose: () => void;
  children: ReactNode;
};

export function ProductDialog({ title, open, className, onClose, children }: ProductDialogProps) {
  const suspended = useContext(SessionInteraction);
  const element = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = element.current;
    return () => {
      dialog?.close();
      previous?.focus();
    };
  }, [open]);

  useEffect(() => {
    const dialog = element.current;
    if (open && !suspended) dialog?.showModal();
    else dialog?.close();
  }, [open, suspended]);

  return (
    <dialog
      ref={element}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
      onKeyDown={trapFocus}
      className={cn(
        'rounded-xl shadow-xl fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto border border-border bg-surface p-6 text-text backdrop:bg-inverse/50',
        className,
      )}
    >
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 id={titleId} className="min-w-0 text-lg font-semibold wrap-anywhere">
          {title}
        </h2>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="rounded-md p-1 text-text-muted hover:bg-surface-muted hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <X className="size-5" aria-hidden="true" />
        </button>
      </div>
      {children}
    </dialog>
  );
}

function trapFocus(event: KeyboardEvent<HTMLDialogElement>) {
  if (event.key !== 'Tab') return;
  const elements = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>(
      'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled)',
    ),
  ).filter((element) => element.getClientRects().length);
  const first = elements[0];
  const last = elements.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
}
