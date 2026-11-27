import type { ComponentProps } from 'react';

import { cn } from './cn';

export type SkeletonProps = ComponentProps<'div'>;

export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      {...props}
      aria-hidden="true"
      className={cn('motion-safe:motion-shimmer rounded-md bg-neutral-soft', className)}
    />
  );
}
