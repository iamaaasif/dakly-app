import type { ComponentProps } from 'react';

import { cn } from './cn';

export type TextareaProps = ComponentProps<'textarea'>;

export function Textarea({ className, ...props }: TextareaProps) {
  return (
    <textarea
      {...props}
      className={cn(
        'min-h-24 w-full min-w-0 rounded-md border border-input-border bg-surface px-3 py-2 text-base text-text placeholder:text-text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-text-subtle aria-invalid:border-danger',
        className,
      )}
    />
  );
}
