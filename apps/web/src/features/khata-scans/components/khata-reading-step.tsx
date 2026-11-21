import { Check, Loader2 } from 'lucide-react';

import { cn } from '@dakly/ui/cn';

const steps = ['Straightening the photo', 'Reading handwriting', 'Matching your customers'];

// The API reports only whether a page is waiting or being read, so the steps follow that.
export function KhataReadingStep({ current }: { current: number }) {
  return (
    <section
      aria-live="polite"
      className="flex flex-col items-center gap-4 rounded-lg border border-border bg-surface px-5 py-10"
    >
      <Loader2
        aria-hidden="true"
        size={44}
        strokeWidth={1.75}
        className="animate-spin text-primary"
      />
      <ol className="flex flex-col gap-2">
        {steps.map((step, index) => (
          <li
            key={step}
            aria-current={index === current ? 'step' : undefined}
            className={cn('flex items-center gap-2', index > current && 'text-text-subtle')}
          >
            {index < current ? (
              <Check aria-hidden="true" size={16} strokeWidth={1.75} className="text-success" />
            ) : (
              <span aria-hidden="true" className="w-4 text-center">
                {index === current ? '•' : ''}
              </span>
            )}
            {step}
          </li>
        ))}
      </ol>
    </section>
  );
}
