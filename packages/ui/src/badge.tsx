import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';

import { cn } from './cn';

const badgeVariants = cva('inline-flex items-center rounded-sm px-2 py-1 text-xs font-medium', {
  variants: {
    variant: {
      neutral: 'bg-surface-muted text-text',
      success: 'bg-success-soft text-success',
      warning: 'bg-warning-soft text-warning',
      danger: 'bg-danger-soft text-danger',
      info: 'bg-info-soft text-info',
      ai: 'bg-ai-soft text-ai',
      inverse: 'bg-inverse text-on-primary',
    },
  },
  defaultVariants: { variant: 'neutral' },
});

export type BadgeProps = ComponentProps<'span'> & VariantProps<typeof badgeVariants>;

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span {...props} className={cn(badgeVariants({ variant }), className)} />;
}
