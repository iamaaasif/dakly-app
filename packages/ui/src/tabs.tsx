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
        '-mb-px min-h-10 shrink-0 border-b-2 border-transparent px-3 text-base text-text-muted hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50 data-[state=active]:border-action data-[state=active]:font-medium data-[state=active]:text-text',
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
