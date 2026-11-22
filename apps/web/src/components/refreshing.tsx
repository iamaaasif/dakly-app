import type { ReactNode } from 'react';

import { cn } from '@dakly/ui/cn';

// Old results stay on screen while new ones load, so the list dims instead of flashing to a skeleton.
export function Refreshing({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <div aria-busy={active} className={cn('transition-opacity', active && 'opacity-60')}>
      {children}
    </div>
  );
}
