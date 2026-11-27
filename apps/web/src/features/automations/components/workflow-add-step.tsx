import { Plus } from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@dakly/ui/dropdown-menu';

import type { CanvasLayout } from '../workflow-canvas-layout';
import type { NewStepKind } from '../workflow-graph-edit';
import type { CanvasEditing } from './workflow-canvas-nodes';
import { dragType, stepChoices } from './workflow-step-choices';

type Props = {
  x: number;
  y: number;
  disabled: boolean;
  onAdd: (kind: NewStepKind) => void;
};

function AddStepButton({ x, y, disabled, onAdd }: Props) {
  return (
    <div
      className="absolute -translate-x-1/2 -translate-y-1/2"
      style={{ left: x, top: y }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        const choice = stepChoices.find(
          (item) => item.kind === event.dataTransfer.getData(dragType),
        );
        if (!disabled && choice) onAdd(choice.kind);
      }}
    >
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={disabled}
          aria-label="Add a step here"
          className="grid size-6 place-items-center rounded-full border border-border bg-surface text-text-muted shadow-card transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus enabled:hover:bg-surface-muted disabled:opacity-50"
        >
          <Plus size={14} aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {stepChoices.map(({ kind, label, icon: Icon }) => (
            <DropdownMenuItem key={kind} onSelect={() => onAdd(kind)}>
              <Icon size={16} aria-hidden="true" />
              {label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function EdgeAddButtons({
  layout,
  editing,
}: {
  layout: CanvasLayout;
  editing: CanvasEditing;
}) {
  return layout.edges.map((edge) => (
    <AddStepButton
      key={edge.id}
      x={edge.midX}
      y={edge.midY}
      disabled={!editing.canAdd}
      onAdd={(kind) => editing.insert({ parent: edge.from, target: edge.to }, kind)}
    />
  ));
}
