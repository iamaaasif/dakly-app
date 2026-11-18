'use client';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useRef, type ReactElement, type ReactNode } from 'react';

import { Button } from './button';
import { cn } from './cn';

const sideClasses = {
  left: 'left-0 border-r',
  right: 'right-0 border-l',
};

export type SheetProps = {
  title: string;
  description?: ReactNode;
  footer?: ReactNode;
  open: boolean;
  side?: keyof typeof sideClasses;
  onClose: () => void;
  fallbackFocus?: () => HTMLElement | null;
  children: ReactNode;
};

export function Sheet({
  title,
  description,
  footer,
  open,
  side = 'right',
  onClose,
  fallbackFocus,
  children,
}: SheetProps) {
  const opener = useRef<Element | null>(null);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-inverse/50" />
        <DialogPrimitive.Content
          {...(!description && { 'aria-describedby': undefined })}
          // Radix returns focus only to its own Trigger; callers open the sheet from their own state.
          onOpenAutoFocus={() => (opener.current = document.activeElement)}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (
              opener.current instanceof HTMLElement &&
              opener.current.isConnected &&
              opener.current !== document.body
            ) {
              opener.current.focus();
            } else {
              fallbackFocus?.()?.focus();
            }
          }}
          className={cn(
            'fixed inset-y-0 z-50 flex h-dvh w-full max-w-sm flex-col border-border bg-surface text-text shadow-overlay',
            footer ? 'overflow-hidden' : 'overflow-y-auto',
            sideClasses[side],
          )}
        >
          <SheetHeader title={title} description={description} />
          <div
            className={cn(
              'flex-1 px-6 pb-6',
              footer &&
                'min-h-0 overflow-y-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus',
            )}
            role={footer ? 'region' : undefined}
            aria-label={footer ? `${title} content` : undefined}
            tabIndex={footer ? 0 : undefined}
          >
            {children}
          </div>
          {footer && <div className="shrink-0 border-t border-border px-6 py-4">{footer}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function SheetHeader({ title, description }: Pick<SheetProps, 'title' | 'description'>) {
  return (
    <div className="flex shrink-0 items-start justify-between gap-4 px-6 pt-6 pb-4">
      <div>
        <DialogPrimitive.Title className="text-lg font-semibold">{title}</DialogPrimitive.Title>
        {description && (
          <DialogPrimitive.Description className="text-sm text-text-muted">
            {description}
          </DialogPrimitive.Description>
        )}
      </div>
      <DialogPrimitive.Close asChild>
        <Button variant="secondary" className="px-2" aria-label="Close">
          <X aria-hidden="true" size={16} strokeWidth={1.75} />
        </Button>
      </DialogPrimitive.Close>
    </div>
  );
}

type SheetDialogProps = {
  title: string;
  trigger: ReactElement;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  children: ReactNode;
};

export function SheetDialog({
  title,
  trigger,
  open,
  onOpenChange,
  pending,
  children,
}: SheetDialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-60 bg-inverse/50" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-70 m-auto h-fit max-h-dvh w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-surface p-6 text-text shadow-overlay"
        >
          <div className="mb-4 flex items-start justify-between gap-4">
            <DialogPrimitive.Title className="min-w-0 text-lg font-semibold wrap-anywhere">
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close asChild>
              <Button variant="secondary" className="shrink-0" disabled={pending}>
                Close
              </Button>
            </DialogPrimitive.Close>
          </div>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
