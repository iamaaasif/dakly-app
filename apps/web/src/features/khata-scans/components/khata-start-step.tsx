import { CalendarDays, FileText } from 'lucide-react';
import type { ReactNode } from 'react';

import { PastImports } from './past-imports';

type StartStepProps = { onStart: () => void };

// "Start from today" in the design points at Shop sales, which is not built yet, so it is not offered.
const startWays = [
  {
    title: 'Add the last 1–3 months',
    hint: 'Photograph recent khata pages. Good for finding regular customers.',
    icon: <CalendarDays aria-hidden="true" size={20} strokeWidth={1.75} />,
  },
  {
    title: 'Digitize old notebooks slowly',
    hint: 'Do a few pages at a time, whenever you have time.',
    icon: <FileText aria-hidden="true" size={20} strokeWidth={1.75} />,
  },
] satisfies { title: string; hint: string; icon: ReactNode }[];

export function KhataStartStep({ onStart }: StartStepProps) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))]">
        {startWays.map((way) => (
          <button
            key={way.title}
            type="button"
            onClick={onStart}
            className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4 text-left hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            <span className="flex size-10 items-center justify-center rounded-lg bg-primary-soft text-primary">
              {way.icon}
            </span>
            <span className="font-semibold">{way.title}</span>
            <span className="text-text-muted">{way.hint}</span>
          </button>
        ))}
      </div>
      <p className="text-text-muted">
        You don’t need to digitize old notebooks to start using Dakly.
      </p>
      <PastImports />
    </>
  );
}
