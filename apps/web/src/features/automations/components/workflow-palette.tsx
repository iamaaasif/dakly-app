import { GripVertical } from 'lucide-react';

import { cn } from '@dakly/ui/cn';

import type { NewStepKind } from '../workflow-graph-edit';
import { dragType, stepChoices } from './workflow-step-choices';

type Props = { disabled: boolean; onAdd: (kind: NewStepKind) => void };

export function WorkflowPalette({ disabled, onAdd }: Props) {
  const groups = ['Messages', 'Flow actions'] as const;
  return (
    <aside
      aria-label="Add a step"
      className="shrink-0 border-b border-border bg-surface p-3 md:w-60 md:border-r md:border-b-0 md:p-4"
    >
      <div className="flex gap-4 overflow-x-auto md:flex-col md:gap-5 md:overflow-visible">
        {groups.map((group) => (
          <section key={group} className="shrink-0 md:shrink">
            <h2 className="mb-2 text-xs font-semibold tracking-wide text-text-muted uppercase">
              {group}
            </h2>
            <ul className="flex gap-2 md:flex-col">
              {stepChoices
                .filter((choice) => choice.group === group)
                .map(({ kind, label, icon: Icon }) => (
                  <li key={kind}>
                    <button
                      type="button"
                      draggable={!disabled}
                      disabled={disabled}
                      onClick={() => onAdd(kind)}
                      onDragStart={(event) => event.dataTransfer.setData(dragType, kind)}
                      className={cn(
                        'shadow-sm flex h-10 w-full items-center gap-2 rounded-md border border-border bg-surface px-3 whitespace-nowrap',
                        'enabled:hover:bg-surface-muted disabled:text-text-muted',
                        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
                      )}
                    >
                      <Icon size={16} aria-hidden="true" />
                      <span className="flex-1 text-left">{label}</span>
                      <GripVertical
                        size={14}
                        aria-hidden="true"
                        className="text-text-muted max-md:hidden"
                      />
                    </button>
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>
      <p className="mt-4 text-sm text-text-muted max-md:hidden">
        Drag a step onto the flow, or click it to add it at the end.
      </p>
    </aside>
  );
}
