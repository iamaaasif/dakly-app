import { CircleAlert, TriangleAlert } from 'lucide-react';

import { Button } from '@dakly/ui/button';

import type { WorkflowCheck } from '../workflow-checks';

type Props = { checks: WorkflowCheck[]; onFix: (fix: NonNullable<WorkflowCheck['fix']>) => void };

export function WorkflowChecksPanel({ checks, onFix }: Props) {
  if (checks.length === 0) return null;
  return (
    <section
      aria-label="Workflow checks"
      className="max-h-40 overflow-y-auto border-b border-border bg-surface-muted px-4 py-2"
    >
      <ul className="space-y-1">
        {checks.map((check) => {
          const Icon = check.level === 'block' ? CircleAlert : TriangleAlert;
          return (
            <li key={check.id} className="flex flex-wrap items-center gap-2 text-sm">
              <Icon
                size={16}
                aria-hidden="true"
                className={check.level === 'block' ? 'text-danger' : 'text-text-muted'}
              />
              <span className="sr-only">
                {check.level === 'block' ? 'Must fix: ' : 'Warning: '}
              </span>
              <span className="min-w-0 flex-1">{check.message}</span>
              {check.fix && (
                <Button variant="secondary" onClick={() => onFix(check.fix!)}>
                  {check.fix.label}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
