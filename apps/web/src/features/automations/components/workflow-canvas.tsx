'use client';

import { Minus, Plus } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { AutomationDetailResponse } from '@dakly/contracts/automations';
import { Badge } from '@dakly/ui/badge';
import { Button, buttonVariants } from '@dakly/ui/button';
import { QueryError } from '@dakly/ui/query-error';

import { useAutomation } from '../api/automations';
import { statusLabels, triggerLabels } from '../automation-labels';
import { layoutWorkflow } from '../workflow-canvas-layout';
import { WorkflowCanvasGraph } from './workflow-canvas-graph';
import { WorkflowPageHeader } from './workflow-page-header';
import { useSessionContext } from '@/lib/session-context';

// Below this the text is too small to read on a phone, so a wide flow scrolls sideways instead.
const READABLE_ZOOM = 0.7;
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 1.5;
const ZOOM_STEP = 0.1;

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

function useViewportWidth() {
  const [width, setWidth] = useState(0);
  const element = useRef<HTMLDivElement | null>(null);
  const ref = useCallback((node: HTMLDivElement | null) => {
    element.current = node;
    if (!node) return;
    setWidth(node.clientWidth);
    const observer = new ResizeObserver(() => setWidth(node.clientWidth));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  // A flow wider than the screen opens on its middle, where the trigger sits. This waits for the
  // first measured width, because that is when the opening zoom is applied.
  const measured = width > 0;
  useEffect(() => {
    const node = element.current;
    if (measured && node) node.scrollLeft = (node.scrollWidth - node.clientWidth) / 2;
  }, [measured]);
  return { width, ref };
}

function CanvasScreen({ workflow }: { workflow: AutomationDetailResponse }) {
  const { data } = useSessionContext();
  const canEdit = data?.currentStore?.canEditAutomations === true;
  const layout = useMemo(() => layoutWorkflow(workflow.graph), [workflow.graph]);
  const [zoom, setZoom] = useState<number | null>(null);
  const viewport = useViewportWidth();
  const fitted = viewport.width ? Math.min(1, viewport.width / layout.width) : 1;
  const scale = zoom ?? Math.max(READABLE_ZOOM, fitted);
  const badge = (
    <Badge variant={workflow.status === 'active' ? 'success' : 'neutral'}>
      {statusLabels[workflow.status]}
    </Badge>
  );
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <WorkflowPageHeader
        title={workflow.name}
        subtitle={`When ${triggerLabels[workflow.graph.trigger.key]}`}
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
          ref={viewport.ref}
          className="absolute inset-0 overflow-auto bg-[radial-gradient(var(--color-border-strong)_1px,transparent_1px)] bg-size-[16px_16px]"
        >
          <WorkflowCanvasGraph graph={workflow.graph} layout={layout} scale={scale} />
        </div>
        <ZoomControls
          scale={scale}
          onChange={(next) => setZoom(clamp(next))}
          onFit={() => setZoom(Math.max(MIN_ZOOM, fitted))}
        />
      </main>
    </div>
  );
}

function clamp(zoom: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(zoom * 10) / 10));
}

type ZoomControlsProps = { scale: number; onChange: (zoom: number) => void; onFit: () => void };

function ZoomControls({ scale, onChange, onFit }: ZoomControlsProps) {
  return (
    <div className="shadow-sm absolute bottom-4 left-4 flex items-center rounded-lg border border-border bg-surface">
      <Button
        variant="secondary"
        className="rounded-r-none border-0"
        aria-label="Zoom out"
        disabled={scale <= MIN_ZOOM}
        onClick={() => onChange(scale - ZOOM_STEP)}
      >
        <Minus size={14} aria-hidden="true" />
      </Button>
      <span role="status" className="w-14 text-center text-sm tabular-nums">
        {Math.round(scale * 100)}%
      </span>
      <Button
        variant="secondary"
        className="rounded-none border-0"
        aria-label="Zoom in"
        disabled={scale >= MAX_ZOOM}
        onClick={() => onChange(scale + ZOOM_STEP)}
      >
        <Plus size={14} aria-hidden="true" />
      </Button>
      <Button
        variant="secondary"
        className="rounded-l-none border-0 border-l border-border"
        onClick={onFit}
      >
        Fit to screen
      </Button>
    </div>
  );
}
