import type { ComponentProps } from 'react';
import { cn } from './cn';

export type CardProps = ComponentProps<'div'>;

export function Card({ className, ...props }: CardProps) {
  return (
    <div
      {...props}
      className={cn('rounded-lg border border-border bg-surface p-6 text-text', className)}
    />
  );
}
