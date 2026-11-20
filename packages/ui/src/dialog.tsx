'use client';
import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode, type KeyboardEvent } from 'react';

import { Button } from './button';
import { cn } from './cn';

export type DialogProps = {
  title: string;
  open: boolean;
  suspended?: boolean;
  closeDisabled?: boolean;
  className?: string;
  onClose: () => void;
  children: ReactNode;
};

export function Dialog(props: DialogProps) {
  const { title, open, suspended = false, closeDisabled, className, onClose, children } = props;
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
        if (!closeDisabled) onClose();
      }}
      onKeyDown={trapFocus}
      className={cn(
        'fixed inset-0 m-auto max-h-full w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-surface p-6 text-text backdrop:bg-inverse/50',
        className,
      )}
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <h2 id={titleId} className="min-w-0 text-lg font-semibold wrap-anywhere">
          {title}
        </h2>
        <Button
          variant="secondary"
          className="shrink-0 px-2"
          aria-label="Close dialog"
          disabled={closeDisabled}
          onClick={onClose}
        >
          <X aria-hidden="true" size={16} strokeWidth={1.75} />
        </Button>
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
  const first = elements[0],
    last = elements.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  }
  if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
}
