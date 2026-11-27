'use client';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import type { ComponentProps } from 'react';

import { cn } from './cn';

export const Tabs = TabsPrimitive.Root;

export type TabsListProps = ComponentProps<typeof TabsPrimitive.List>;

export function TabsList({ className, ...props }: TabsListProps) {
  return (
    <TabsPrimitive.List
      {...props}
      className={cn('flex gap-1 overflow-x-auto border-b border-border', className)}
    />
  );
}

export type TabsTriggerProps = ComponentProps<typeof TabsPrimitive.Trigger>;

export function TabsTrigger({ className, ...props }: TabsTriggerProps) {
  return (
    <TabsPrimitive.Trigger
      {...props}
      className={cn(
        'group motion-tab relative -mb-px inline-flex min-h-10 shrink-0 items-center gap-2 px-3 text-base text-text-muted after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:origin-center after:scale-x-0 after:bg-action hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50 data-[state=active]:font-medium data-[state=active]:text-text data-[state=active]:after:scale-x-100',
        className,
      )}
    />
  );
}

// The count sits inside the tab label, so the tab keeps one accessible name such as "Pending 4".
export function TabCount({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      {...props}
      className={cn(
        'rounded-full bg-border px-2 text-xs font-semibold text-text-secondary tabular-nums group-data-[state=active]:bg-primary-soft group-data-[state=active]:text-action-hover',
        className,
      )}
    />
  );
}

export type TabsContentProps = ComponentProps<typeof TabsPrimitive.Content>;

export function TabsContent({ className, ...props }: TabsContentProps) {
  return (
    <TabsPrimitive.Content
      {...props}
      className={cn(
        'pt-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
        className,
      )}
    />
  );
}
