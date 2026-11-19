'use client';

import { Ellipsis, Zap } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import type { AutomationListItem } from '@dakly/contracts/automations';
import { Badge } from '@dakly/ui/badge';
import { Button } from '@dakly/ui/button';
import { Dialog } from '@dakly/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@dakly/ui/dropdown-menu';

import { useAutomationAction } from '../api/automation-actions';
import { channelLabels, triggerLabels } from '../automation-labels';

export function AutomationRow({
  workflow,
  canEdit,
}: {
  workflow: AutomationListItem;
  canEdit: boolean;
}) {
  const active = workflow.status === 'active';
  const draft = workflow.status === 'draft';
  const statusLabels = {
    active: 'Active',
    draft: 'Draft',
    paused: 'Disabled',
    archived: 'Archived',
  };
  const channels = workflow.channels.map((channel) => channelLabels[channel]).join(', ');
  const description = [
    `When ${triggerLabels[workflow.trigger]}`,
    `${workflow.stepCount} ${workflow.stepCount === 1 ? 'step' : 'steps'}`,
    channels,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <li className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center">
      <div className="flex min-w-0 items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-primary-soft text-action">
          <Zap size={16} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold wrap-anywhere">{workflow.name}</span>
            <Badge variant={active ? 'success' : 'neutral'}>{statusLabels[workflow.status]}</Badge>
          </div>
          <p className="text-sm text-text-muted">{description}</p>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <dt className="text-text-muted">Entered, 30 days</dt>
          <dd className="font-semibold tabular-nums">{draft ? '—' : workflow.enteredLast30Days}</dd>
        </div>
        <div>
          <dt className="text-text-muted">Revenue, 30 days</dt>
          <dd className="font-semibold">—</dd>
        </div>
      </dl>
      {canEdit && <WorkflowActions workflow={workflow} />}
    </li>
  );
}

function WorkflowActions({ workflow }: { workflow: AutomationListItem }) {
  const [confirm, setConfirm] = useState(false);
  const action = useAutomationAction();
  const active = workflow.status === 'active';
  const draft = workflow.status === 'draft';
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {!draft && (
          <Button
            variant="secondary"
            loading={action.isPending && !confirm}
            onClick={() => action.mutate({ id: workflow.id, action: active ? 'pause' : 'enable' })}
          >
            {active ? 'Disable' : 'Enable'}
          </Button>
        )}
        <Link
          href={`/automations/${workflow.id}`}
          className="inline-flex min-h-10 items-center rounded-md border border-input-border px-3 font-medium hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          Edit
        </Link>

        <WorkflowMenu
          workflow={workflow}
          action={action}
          onDelete={() => {
            action.reset();
            setConfirm(true);
          }}
        />
      </div>
      {action.isError && !confirm && (
        <p role="alert" className="text-danger">
          {action.error.message}
        </p>
      )}
      <DeleteWorkflow
        workflow={workflow}
        action={action}
        open={confirm}
        onClose={() => setConfirm(false)}
      />
    </div>
  );
}

function WorkflowMenu({
  workflow,
  action,
  onDelete,
}: {
  workflow: AutomationListItem;
  action: ReturnType<typeof useAutomationAction>;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="secondary"
          aria-label={`Actions for ${workflow.name}`}
          className="border-transparent px-2"
        >
          <Ellipsis size={16} aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem
          disabled={action.isPending}
          onSelect={() =>
            action.mutate({
              draft: { name: `${workflow.name.slice(0, 75)} copy`, graph: workflow.graph },
            })
          }
        >
          Duplicate
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            onDelete();
          }}
        >
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DeleteWorkflow({
  workflow,
  action,
  open,
  onClose,
}: {
  workflow: AutomationListItem;
  action: ReturnType<typeof useAutomationAction>;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={() => onClose()}
      closeDisabled={action.isPending}
      title={`Delete ${workflow.name}?`}
    >
      <Button
        variant="danger"
        loading={action.isPending}
        onClick={() =>
          action.mutate({ id: workflow.id, action: 'archive' }, { onSuccess: () => onClose() })
        }
      >
        Delete workflow
      </Button>
      {action.isError && (
        <p role="alert" className="mt-3 text-danger">
          {action.error.message}
        </p>
      )}
    </Dialog>
  );
}
