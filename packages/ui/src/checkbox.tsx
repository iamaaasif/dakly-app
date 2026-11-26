'use client';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check, Minus } from 'lucide-react';
import type { ComponentProps } from 'react';

import { cn } from './cn';

export type CheckboxProps = ComponentProps<typeof CheckboxPrimitive.Root>;

export function Checkbox({ className, ...props }: CheckboxProps) {
  return (
    <CheckboxPrimitive.Root
      {...props}
      className={cn(
        // The box is 20 px; the after element widens the tap target to 40 px.
        'group/checkbox relative size-5 shrink-0 rounded-sm border border-input-border bg-surface text-on-primary after:absolute after:-inset-2.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger data-[state=checked]:border-action data-[state=checked]:bg-action data-[state=indeterminate]:border-action data-[state=indeterminate]:bg-action',
        className,
      )}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center">
        <Check
          aria-hidden="true"
          size={16}
          strokeWidth={1.75}
          className="group-data-[state=indeterminate]/checkbox:hidden"
        />
        <Minus
          aria-hidden="true"
          size={16}
          strokeWidth={1.75}
          className="hidden group-data-[state=indeterminate]/checkbox:block"
        />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
