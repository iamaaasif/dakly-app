'use client';

import Link from 'next/link';
import { useMemo } from 'react';

import type { AutomationDetailResponse } from '@dakly/contracts/automations';
import { Badge } from '@dakly/ui/badge';
import { buttonVariants } from '@dakly/ui/button';
import { QueryError } from '@dakly/ui/query-error';

import { useAutomation } from '../api/automations';
import { statusLabels, triggerEntryLabels } from '../automation-labels';
import { layoutWorkflow } from '../workflow-canvas-layout';
import { WorkflowCanvasGraph } from './workflow-canvas-graph';
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

// A flow wider than the screen opens on its middle, where the trigger sits.
function centerScroll(node: HTMLDivElement | null) {
  if (node) node.scrollLeft = (node.scrollWidth - node.clientWidth) / 2;
}

function CanvasScreen({ workflow }: { workflow: AutomationDetailResponse }) {
  const { data } = useSessionContext();
  const canEdit = data?.currentStore?.canEditAutomations === true;
  const layout = useMemo(() => layoutWorkflow(workflow.graph), [workflow.graph]);
  const badge = (
    <Badge variant={workflow.status === 'active' ? 'success' : 'neutral'}>
      {statusLabels[workflow.status]}
    </Badge>
  );
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <WorkflowPageHeader
        title={workflow.name}
        subtitle={`Customers enter when they ${triggerEntryLabels[workflow.graph.trigger.key]}`}
        badge={badge}
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
        <div
          ref={centerScroll}
          className="absolute inset-0 overflow-auto bg-[radial-gradient(var(--color-border-strong)_1px,transparent_1px)] bg-size-[16px_16px]"
        >
          <WorkflowCanvasGraph graph={workflow.graph} layout={layout} />
        </div>
      </main>
    </div>
  );
}
