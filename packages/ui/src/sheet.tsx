'use client';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useRef, type ReactNode, type RefObject } from 'react';

import { Button } from './button';
import { cn } from './cn';

const sideClasses = {
  left: 'left-0 border-r',
  right: 'right-0 border-l',
};

export type SheetProps = {
  title: string;
  open: boolean;
  side?: keyof typeof sideClasses;
  onClose: () => void;
  fallbackFocus?: RefObject<HTMLElement | null>;
  children: ReactNode;
};

export function Sheet({
  title,
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
          aria-describedby={undefined}
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
              fallbackFocus?.current?.focus();
            }
          }}
          className={cn(
            'fixed inset-y-0 z-50 flex h-dvh w-full max-w-sm flex-col overflow-y-auto border-border bg-surface p-6 text-text shadow-overlay',
            sideClasses[side],
          )}
        >
          <div className="mb-4 flex items-start justify-between gap-4">
            <DialogPrimitive.Title className="text-lg font-semibold">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Close asChild>
              <Button variant="secondary" className="px-2" aria-label="Close">
                <X aria-hidden="true" size={16} strokeWidth={1.75} />
              </Button>
            </DialogPrimitive.Close>
          </div>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
