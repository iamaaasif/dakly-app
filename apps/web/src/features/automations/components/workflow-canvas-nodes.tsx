import {
  Bell,
  Clock,
  Flag,
  Hand,
  ListTodo,
  type LucideIcon,
  MessageCircle,
  MessageSquareText,
  Shuffle,
  Split,
  Tag,
  Ticket,
  EllipsisVertical,
  Zap,
} from 'lucide-react';
import type { ReactNode } from 'react';

import type { AutomationStepStats } from '@dakly/contracts/automations';
import type {
  AutomationChannel,
  AutomationGraph,
  AutomationStep,
} from '@dakly/contracts/automations/graph';
import { formatCount } from '@dakly/contracts/money';
import { cn } from '@dakly/ui/cn';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@dakly/ui/dropdown-menu';

import { channelLabels, triggerEntryLabels } from '../automation-labels';
import {
  actionDetail,
  actionLabel,
  conditionLabel,
  triggerRows,
  waitParts,
} from '../workflow-canvas-labels';
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
  reply_to_comment: MessageCircle,
  send_private_reply: MessageSquareText,
};

function IconBox({ icon: Icon, tone = 'brand' }: { icon: LucideIcon; tone?: 'brand' | 'neutral' }) {
  return (
    <span
      className={cn(
        'grid size-9 shrink-0 place-items-center rounded-md',
        tone === 'brand'
          ? 'bg-primary-soft text-action-hover'
          : 'bg-neutral-soft text-text-secondary',
      )}
    >
      <Icon size={16} aria-hidden="true" />
    </span>
  );
}

type CardProps = { icon: LucideIcon; title: string; detail?: string; tone?: 'brand' | 'neutral' };

function StepCard({ icon, title, detail, tone }: CardProps) {
  return (
    <div className="flex h-full items-center gap-3 rounded-lg border border-border bg-surface pr-9 pl-3 shadow-card transition-[border-color,transform] duration-150 ease-out group-hover/node:border-border-strong">
      <IconBox icon={icon} tone={tone} />
      <div className="min-w-0">
        <p className="truncate text-base font-semibold" title={title}>
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

function splitDetail(
  step: Extract<AutomationStep, { kind: 'condition' }>,
  stepNumber: (key: string) => number,
) {
  return step.paths.length === 1
    ? conditionLabel(step.paths[0]!.condition, stepNumber)
    : `${step.paths.length + 1} paths`;
}

function stepBody(step: AutomationStep, stepNumber: (key: string) => number) {
  switch (step.kind) {
    case 'wait': {
      const [lead, amount] = waitParts(step.wait);
      return (
        <p className="flex h-full items-center gap-2 rounded-full border border-border bg-surface pr-9 pl-4 shadow-card transition-colors duration-150 ease-out group-hover/node:border-border-strong">
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
          icon={step.channels[0] === 'sms' ? MessageSquareText : MessageCircle}
          title={sendTitle(step.channels)}
          detail={step.message.text}
        />
      );
    case 'action':
      return (
        <StepCard
          icon={actionIcons[step.action.action]}
          title={actionLabel(step.action)}
          detail={actionDetail(step.action)}
          tone="neutral"
        />
      );
    case 'condition':
      return (
        <StepCard
          icon={Split}
          title="Conditional split"
          detail={splitDetail(step, stepNumber)}
          tone="neutral"
        />
      );
    case 'random_split':
      return (
        <StepCard
          icon={Shuffle}
          title="Random split"
          detail={`${step.paths.length} paths`}
          tone="neutral"
        />
      );
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
  insertAfterMerge: (target: string, kind: NewStepKind) => void;
  remove: (key: string) => void;
  canMove: (key: string, direction: 'up' | 'down') => boolean;
  move: (key: string, direction: 'up' | 'down') => void;
  open: (key: string) => void;
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
        className="absolute top-1/2 right-1 grid size-8 -translate-y-1/2 place-items-center rounded-md text-text-subtle transition-colors hover:bg-surface-muted hover:text-text-secondary focus-visible:outline-2 focus-visible:outline-focus"
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

export type StepStats = AutomationStepStats['steps'];

const noStats = { reached: 0, sent: 0, tapped: 0 };

// Sends show what happened to the message; every other step shows how many people got there.
function StatsChip({
  step,
  stats,
}: {
  step: AutomationStep;
  stats: StepStats[string] | undefined;
}) {
  const counts = stats ?? noStats;
  const parts =
    step.kind === 'send'
      ? [`${formatCount(counts.sent)} sent`, `${formatCount(counts.tapped)} tapped`]
      : [`${formatCount(counts.reached)} ${counts.reached === 1 ? 'entry' : 'entries'}`];
  return (
    <p className="absolute -top-2.5 right-3 rounded-full border border-border bg-surface px-2 text-xs text-text-muted tabular-nums shadow-card">
      {parts.join(' · ')}
      <span className="sr-only">
        {`. ${formatCount(counts.reached)} ${counts.reached === 1 ? 'entry' : 'entries'} reached this step.`}
      </span>
    </p>
  );
}

type TriggerCardProps = { graph: AutomationGraph; layout: CanvasLayout; recentEntries?: string };

function TriggerCard({ graph, layout, recentEntries }: TriggerCardProps) {
  return (
    <div className="h-full space-y-2 rounded-lg border border-border bg-surface p-4 shadow-card transition-colors duration-150 ease-out group-hover/node:border-border-strong">
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

function EditOverlays({
  node,
  number,
  editing,
}: {
  node: CanvasNode;
  number: number;
  editing: CanvasEditing;
}) {
  return (
    <>
      <button
        type="button"
        aria-label={`Edit step ${number}`}
        onClick={() => editing.open(node.key)}
        className="absolute inset-0 rounded-lg focus-visible:outline-2 focus-visible:outline-focus"
      />
      <StepMenu node={node} number={number} editing={editing} />
    </>
  );
}

function NodeExtras({
  node,
  editing,
  stats,
}: {
  node: CanvasNode;
  editing?: CanvasEditing;
  stats?: StepStats;
}) {
  const { step, number } = node;
  return (
    <>
      {stats && step && step.kind !== 'exit' && <StatsChip step={step} stats={stats[node.key]} />}
      {editing && step && number !== null && (
        <EditOverlays node={node} number={number} editing={editing} />
      )}
      {node.branches.length > 0 && (
        <ul className="sr-only">
          {node.branches.map((branch, index) => (
            <li key={index}>{branch}</li>
          ))}
        </ul>
      )}
      {number !== null && <span className="sr-only">Step {number}</span>}
    </>
  );
}

function sendTitle(channels: readonly AutomationChannel[]) {
  const [only] = channels;
  return only && channels.length === 1 ? channelLabels[only] : 'Send message';
}

export function CanvasNodeItem({
  node,
  graph,
  layout,
  recentEntries,
  editing,
  stats,
}: TriggerCardProps & { node: CanvasNode; editing?: CanvasEditing; stats?: StepStats }): ReactNode {
  const { step } = node;
  return (
    <li
      className={cn(
        'group/node absolute list-none',
        step?.kind === 'exit' && 'pointer-events-none',
      )}
      style={{ left: node.x, top: node.y, width: node.width, height: node.height }}
    >
      {step ? (
        stepBody(step, layout.stepNumber)
      ) : (
        <TriggerCard graph={graph} layout={layout} recentEntries={recentEntries} />
      )}
      <NodeExtras node={node} editing={editing} stats={stats} />
    </li>
  );
}
