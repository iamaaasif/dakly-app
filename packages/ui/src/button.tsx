import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';

import { cn } from './cn';

export const buttonVariants = cva(
  'inline-flex min-h-10 min-w-10 items-center justify-center gap-2 rounded-md px-4 py-2 text-base font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-action text-on-primary hover:bg-action-hover',
        secondary: 'border border-input-border bg-surface text-text hover:bg-surface-muted',
        danger: 'bg-danger text-on-primary hover:bg-danger-hover',
        link: 'px-0 text-action hover:underline',
      },
      // The compact button of dense toolbars such as the Inbox header.
      size: { md: '', sm: 'min-h-9 px-2.5 py-1 text-sm' },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export type ButtonProps = ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & { loading?: boolean };

export function Button({
  className,
  variant,
  size,
  loading = false,
  disabled,
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || props['aria-busy']}
    >
      {loading && (
        <span
          aria-hidden="true"
          className="size-4 rounded-full border-2 border-current border-r-transparent motion-safe:animate-spin"
        />
      )}
      {children}
    </button>
  );
}
