import type { ComponentProps } from 'react';

import { cn } from './cn';

export type LabelProps = ComponentProps<'label'>;

export function Label({ className, ...props }: LabelProps) {
  return <label {...props} className={cn('block font-medium text-text', className)} />;
}
