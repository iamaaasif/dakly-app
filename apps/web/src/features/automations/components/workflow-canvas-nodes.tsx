import {
  Bell,
  Clock,
  Flag,
  Hand,
  ListTodo,
  type LucideIcon,
  MessageSquare,
  Shuffle,
  Split,
  Tag,
  Ticket,
  EllipsisVertical,
  Zap,
} from 'lucide-react';
import type { ReactNode } from 'react';

import type { AutomationGraph, AutomationStep } from '@dakly/contracts/automations/graph';
import { cn } from '@dakly/ui/cn';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@dakly/ui/dropdown-menu';

import { channelLabels, triggerEntryLabels } from '../automation-labels';
import { actionDetail, actionLabel, triggerRows, waitParts } from '../workflow-canvas-labels';
import type { CanvasLayout, CanvasNode } from '../workflow-canvas-layout';
import type { NewStepKind } from '../workflow-graph-edit';

const actionIcons: Record<
  Extract<AutomationStep, { kind: 'action' }>['action']['action'],
  LucideIcon
> = {
  add_tag: Tag,
  remove_tag: Tag,
  create_task: ListTodo,
  notify_team: Bell,
  hand_to_person: Hand,
  give_coupon: Ticket,
};

function IconBox({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="grid size-9 shrink-0 place-items-center rounded-md bg-primary-soft text-action-hover">
      <Icon size={16} aria-hidden="true" />
    </span>
  );
}

function StepCard({ icon, title, detail }: { icon: LucideIcon; title: string; detail?: string }) {
  return (
    <div className="shadow-sm flex h-full items-center gap-3 rounded-lg border border-border bg-surface pr-9 pl-3">
      <IconBox icon={icon} />
      <div className="min-w-0">
        <p className="truncate font-semibold" title={title}>
          {title}
        </p>
        {detail && (
          <p className="truncate text-sm text-text-muted" title={detail}>
            {detail}
          </p>
        )}
      </div>
    </div>
  );
}

function stepBody(step: AutomationStep) {
  switch (step.kind) {
    case 'wait': {
      const [lead, amount] = waitParts(step.wait);
      return (
        <p className="shadow-sm flex h-full items-center gap-2 rounded-full border border-border bg-surface pr-9 pl-4">
          <Clock size={16} aria-hidden="true" className="shrink-0 text-text-muted" />
          <span className="truncate">
            {lead} <strong>{amount}</strong>
          </span>
        </p>
      );
    }
    case 'send':
      return (
        <StepCard
          icon={MessageSquare}
          title={step.channels.map((channel) => channelLabels[channel]).join(' / ')}
          detail={step.message.text}
        />
      );
    case 'action':
      return (
        <StepCard
          icon={actionIcons[step.action.action]}
          title={actionLabel(step.action)}
          detail={actionDetail(step.action)}
        />
      );
    case 'condition':
      return (
        <StepCard
          icon={Split}
          title="Conditional split"
          detail={`${step.paths.length + 1} paths`}
        />
      );
    case 'random_split':
      return <StepCard icon={Shuffle} title="Random split" detail={`${step.paths.length} paths`} />;
    case 'exit':
      return (
        <p className="flex h-full items-center justify-center gap-2 text-text-muted">
          <Flag size={14} aria-hidden="true" />
          Exit
        </p>
      );
  }
}

// Set while the canvas is being edited.
export type CanvasEditing = {
  canAdd: boolean;
  insert: (edge: { parent: string; target: string }, kind: NewStepKind) => void;
  remove: (key: string) => void;
  canMove: (key: string, direction: 'up' | 'down') => boolean;
  move: (key: string, direction: 'up' | 'down') => void;
};

function StepMenu({
  node,
  number,
  editing,
}: {
  node: CanvasNode;
  number: number;
  editing: CanvasEditing;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Options for step ${number}`}
        className="absolute top-1/2 right-1 grid size-8 -translate-y-1/2 place-items-center rounded-md text-text-muted hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-focus"
      >
        <EllipsisVertical size={16} aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {(['up', 'down'] as const).map((direction) => (
          <DropdownMenuItem
            key={direction}
            disabled={!editing.canMove(node.key, direction)}
            onSelect={() => editing.move(node.key, direction)}
          >
            Move {direction}
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem onSelect={() => editing.remove(node.key)}>Delete step</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type TriggerCardProps = { graph: AutomationGraph; layout: CanvasLayout; recentEntries?: string };

function TriggerCard({ graph, layout, recentEntries }: TriggerCardProps) {
  return (
    <div className="shadow-sm h-full space-y-2 rounded-lg border border-border bg-surface p-4">
      <div className="flex items-start gap-3">
        <IconBox icon={Zap} />
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wide text-text-muted uppercase">Trigger</p>
          <p className="line-clamp-2">
            Customers enter when they <strong>{triggerEntryLabels[graph.trigger.key]}</strong>
          </p>
        </div>
      </div>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 border-t border-border pt-2 text-sm">
        {[
          ...triggerRows(graph, layout.stepNumber),
          ...(recentEntries ? [['Last 7 days', recentEntries]] : []),
        ].map(([name, value]) => (
          <div key={name} className="col-span-2 grid grid-cols-subgrid">
            <dt className="text-text-muted">{name}</dt>
            <dd className="truncate" title={value}>
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function CanvasNodeItem({
  node,
  graph,
  layout,
  recentEntries,
  editing,
}: TriggerCardProps & { node: CanvasNode; editing?: CanvasEditing }): ReactNode {
  const { step, number } = node;
  return (
    <li
      className={cn('absolute list-none', step?.kind === 'exit' && 'pointer-events-none')}
      style={{ left: node.x, top: node.y, width: node.width, height: node.height }}
    >
      {step ? (
        stepBody(step)
      ) : (
        <TriggerCard graph={graph} layout={layout} recentEntries={recentEntries} />
      )}
      {editing && step && number !== null && (
        <StepMenu node={node} number={number} editing={editing} />
      )}
      {node.branches.length > 0 && (
        <ul className="sr-only">
          {node.branches.map((branch, index) => (
            <li key={index}>{branch}</li>
          ))}
        </ul>
      )}
      {number !== null && (
        <span className="absolute -top-2 -left-2 grid size-6 place-items-center rounded-full bg-inverse text-xs font-semibold text-on-primary tabular-nums">
          <span className="sr-only">Step </span>
          {number}
        </span>
      )}
    </li>
  );
}
