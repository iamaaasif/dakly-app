'use client';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import type { ComponentProps } from 'react';

import { cn } from './cn';

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverClose = PopoverPrimitive.Close;

export function PopoverContent({
  className,
  sideOffset = 6,
  align = 'start',
  ...props
}: ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        sideOffset={sideOffset}
        align={align}
        className={cn(
          'z-50 w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-surface p-3 shadow-overlay',
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}
