'use client';

import Link from 'next/link';
import { useMemo } from 'react';

import type { AutomationDetailResponse } from '@dakly/contracts/automations';
import { formatCount } from '@dakly/contracts/money';
import { Badge } from '@dakly/ui/badge';
import { buttonVariants } from '@dakly/ui/button';
import { QueryError } from '@dakly/ui/query-error';

import { useAutomation, useTriggerPreview } from '../api/automations';
import { statusLabels } from '../automation-labels';
import { layoutWorkflow } from '../workflow-canvas-layout';
import { WorkflowCanvasViewport } from './workflow-canvas-viewport';
import { WorkflowPageHeader } from './workflow-page-header';
import { useSessionContext } from '@/lib/session-context';

export function WorkflowCanvas({ id }: { id: string }) {
  const workflow = useAutomation(id);
  if (workflow.isError && !workflow.data)
    return (
      <QueryError message="Could not load this workflow." onRetry={() => void workflow.refetch()} />
    );
  if (!workflow.data)
    return (
      <p role="status" className="p-4">
        Loading workflow…
      </p>
    );
  return <CanvasScreen workflow={workflow.data} />;
}

// Only these triggers have stored events to count.
const countedTriggers = ['consent_given', 'tag_added', 'birthday'];

function recentEntriesLabel(preview: ReturnType<typeof useTriggerPreview>) {
  if (preview.isError) return 'Could not load';
  if (!preview.data) return '…';
  const { people, atLeast } = preview.data.lastSevenDays;
  return `${formatCount(people)}${atLeast ? '+' : ''} ${people === 1 ? 'person' : 'people'}`;
}

function CanvasScreen({ workflow }: { workflow: AutomationDetailResponse }) {
  const { data } = useSessionContext();
  const canEdit = data?.currentStore?.canEditAutomations === true;
  const counted = countedTriggers.includes(workflow.graph.trigger.key);
  const preview = useTriggerPreview(workflow.id, counted);
  const layout = useMemo(() => layoutWorkflow(workflow.graph), [workflow.graph]);
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <WorkflowPageHeader
        title={workflow.name}
        badge={
          <Badge variant={workflow.status === 'active' ? 'success' : 'neutral'}>
            {statusLabels[workflow.status]}
          </Badge>
        }
      >
        {canEdit && (
          <Link
            href={`/automations/${workflow.id}`}
            className={buttonVariants({ variant: 'secondary' })}
          >
            Workflow settings
          </Link>
        )}
      </WorkflowPageHeader>
      <main className="relative flex-1">
        <WorkflowCanvasViewport
          graph={workflow.graph}
          layout={layout}
          recentEntries={counted ? recentEntriesLabel(preview) : undefined}
        />
      </main>
    </div>
  );
}
