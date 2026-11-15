import type { ComponentProps } from 'react';

import { cn } from './cn';

export type InputProps = ComponentProps<'input'>;

export function Input({ className, ...props }: InputProps) {
  return (
    <input
      {...props}
      className={cn(
        'min-h-10 w-full min-w-0 rounded-md border border-input-border bg-surface px-3 py-2 text-base text-text placeholder:text-text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-text-subtle aria-invalid:border-danger',
        className,
      )}
    />
  );
}
