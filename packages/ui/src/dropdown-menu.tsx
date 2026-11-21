'use client';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { Check } from 'lucide-react';
import type { ComponentProps } from 'react';

import { cn } from './cn';

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

export type DropdownMenuContentProps = ComponentProps<typeof DropdownMenuPrimitive.Content>;

export function DropdownMenuContent({
  className,
  align = 'end',
  sideOffset = 4,
  ...props
}: DropdownMenuContentProps) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        {...props}
        align={align}
        sideOffset={sideOffset}
        className={cn(
          'z-50 min-w-40 rounded-lg border border-border bg-surface p-1 text-text shadow-overlay',
          className,
        )}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

export type DropdownMenuItemProps = ComponentProps<typeof DropdownMenuPrimitive.Item>;

export function DropdownMenuItem({ className, ...props }: DropdownMenuItemProps) {
  return (
    <DropdownMenuPrimitive.Item
      {...props}
      className={cn(
        'flex min-h-10 cursor-pointer items-center gap-2 rounded-sm px-3 text-base outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:text-text-subtle data-[highlighted]:bg-surface-muted',
        className,
      )}
    />
  );
}

export type DropdownMenuSeparatorProps = ComponentProps<typeof DropdownMenuPrimitive.Separator>;

export function DropdownMenuSeparator({ className, ...props }: DropdownMenuSeparatorProps) {
  return (
    <DropdownMenuPrimitive.Separator
      {...props}
      className={cn('-mx-1 my-1 h-px bg-border', className)}
    />
  );
}

export type DropdownMenuCheckboxItemProps = ComponentProps<
  typeof DropdownMenuPrimitive.CheckboxItem
>;

// The menu stays open after a choice, so several can be changed in one visit.
export function DropdownMenuCheckboxItem({
  className,
  children,
  onSelect,
  ...props
}: DropdownMenuCheckboxItemProps) {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      {...props}
      onSelect={(event) => {
        event.preventDefault();
        onSelect?.(event);
      }}
      className={cn(
        'flex min-h-10 cursor-pointer items-center gap-2 rounded-sm px-3 text-sm outline-none select-none data-[highlighted]:bg-primary-soft',
        className,
      )}
    >
      <span className="flex size-4 shrink-0 items-center justify-center rounded-sm border border-input-border bg-surface text-on-primary [[data-state=checked]_&]:border-primary [[data-state=checked]_&]:bg-primary">
        <DropdownMenuPrimitive.ItemIndicator>
          <Check aria-hidden="true" size={12} strokeWidth={2.5} />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  );
}
