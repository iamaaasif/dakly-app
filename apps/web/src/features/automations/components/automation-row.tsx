'use client';

import { EllipsisVertical, Zap } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import type { AutomationListItem } from '@dakly/contracts/automations';
import { formatMoney } from '@dakly/contracts/money';
import { Badge } from '@dakly/ui/badge';
import { Button, buttonVariants } from '@dakly/ui/button';
import { Dialog } from '@dakly/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@dakly/ui/dropdown-menu';

import { useChangeAutomationStatus, useDuplicateAutomation } from '../api/automation-actions';
import { channelLabels, statusLabels, triggerLabels } from '../automation-labels';

export function AutomationRow({
  workflow,
  canEdit,
}: {
  workflow: AutomationListItem;
  canEdit: boolean;
}) {
  const active = workflow.status === 'active';
  const draft = workflow.status === 'draft';
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
          <dd className="text-base font-semibold tabular-nums">
            {draft ? '—' : workflow.enteredLast30Days}
          </dd>
        </div>
        <div>
          <dt className="text-text-muted">Revenue, 30 days</dt>
          <dd className="text-base font-semibold tabular-nums">
            {draft ? '—' : formatMoney(BigInt(workflow.attributedRevenuePoisha))}
          </dd>
        </div>
      </dl>
      {canEdit && <WorkflowActions workflow={workflow} />}
    </li>
  );
}

function WorkflowActions({ workflow }: { workflow: AutomationListItem }) {
  const [confirm, setConfirm] = useState(false);
  const status = useChangeAutomationStatus();
  const duplicate = useDuplicateAutomation();
  const error = status.error ?? duplicate.error;
  const active = workflow.status === 'active';
  const draft = workflow.status === 'draft';
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {!draft && (
          <Button
            variant="secondary"
            loading={status.isPending}
            disabled={duplicate.isPending}
            onClick={() => {
              duplicate.reset();
              status.mutate({ id: workflow.id, action: active ? 'pause' : 'enable' });
            }}
          >
            {active ? 'Disable' : 'Enable'}
          </Button>
        )}
        <Link
          href={`/automations/${workflow.id}`}
          className={buttonVariants({ variant: 'secondary' })}
        >
          Edit
        </Link>

        <WorkflowMenu
          workflow={workflow}
          disabled={status.isPending || duplicate.isPending}
          onDuplicate={() => {
            status.reset();
            duplicate.mutate(workflow);
          }}
          onDelete={() => {
            status.reset();
            duplicate.reset();
            setConfirm(true);
          }}
        />
      </div>
      {error && (
        <p role="alert" className="text-danger">
          {error.message}
        </p>
      )}
      {confirm && <DeleteWorkflow workflow={workflow} onClose={() => setConfirm(false)} />}
    </div>
  );
}

function WorkflowMenu({
  workflow,
  disabled,
  onDuplicate,
  onDelete,
}: {
  workflow: AutomationListItem;
  disabled: boolean;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <Button
          variant="secondary"
          aria-label={`Actions for ${workflow.name}`}
          className="border-transparent px-2"
        >
          <EllipsisVertical size={16} aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem disabled={disabled} onSelect={onDuplicate}>
          Duplicate
        </DropdownMenuItem>
        <DropdownMenuItem disabled={disabled} onSelect={onDelete}>
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DeleteWorkflow({
  workflow,
  onClose,
}: {
  workflow: AutomationListItem;
  onClose: () => void;
}) {
  const archive = useChangeAutomationStatus();
  return (
    <Dialog
      open
      onClose={onClose}
      closeDisabled={archive.isPending}
      title={`Delete ${workflow.name}?`}
    >
      <Button
        variant="danger"
        loading={archive.isPending}
        onClick={() =>
          archive.mutate({ id: workflow.id, action: 'archive' }, { onSuccess: () => onClose() })
        }
      >
        Delete workflow
      </Button>
      {archive.isError && (
        <p role="alert" className="mt-3 text-danger">
          {archive.error.message}
        </p>
      )}
    </Dialog>
  );
}
