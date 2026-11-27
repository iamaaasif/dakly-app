import { Minus, Plus } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';

import type { AutomationGraph } from '@dakly/contracts/automations/graph';
import { Button } from '@dakly/ui/button';

import type { CanvasLayout } from '../workflow-canvas-layout';
import { WorkflowCanvasGraph } from './workflow-canvas-graph';
import type { CanvasEditing, StepStats } from './workflow-canvas-nodes';

// Below this the text is too small to read on a phone, so a wide flow scrolls sideways instead.
const READABLE_ZOOM = 0.7;
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 1.5;
const ZOOM_STEP = 0.1;

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

type Props = {
  graph: AutomationGraph;
  layout: CanvasLayout;
  recentEntries?: string;
  editing?: CanvasEditing;
  stats?: StepStats;
  // Sits at the end of the zoom controls.
  extraControl?: ReactNode;
};

type ZoomProps = {
  scale: number;
  onChange: (zoom: number) => void;
  onFit: () => void;
  extra?: ReactNode;
};

function ZoomControls({ scale, onChange, onFit, extra }: ZoomProps) {
  return (
    <div className="absolute bottom-4 left-4 flex items-center overflow-hidden rounded-lg border border-border bg-surface shadow-card">
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
        className="rounded-none border-0 border-l border-border whitespace-nowrap"
        onClick={onFit}
      >
        <span>
          Fit<span className="max-sm:sr-only"> to screen</span>
        </span>
      </Button>
      {extra}
    </div>
  );
}

export function WorkflowCanvasViewport({
  graph,
  layout,
  recentEntries,
  editing,
  stats,
  extraControl,
}: Props) {
  const [zoom, setZoom] = useState<number | null>(null);
  const viewport = useViewportWidth();
  const fitted = viewport.width ? Math.min(1, viewport.width / layout.width) : 1;
  const scale = zoom ?? Math.max(READABLE_ZOOM, fitted);
  function change(next: number) {
    setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(next * 10) / 10)));
  }
  return (
    <>
      <div
        ref={viewport.ref}
        className="absolute inset-0 overflow-auto bg-[radial-gradient(var(--color-border-strong)_1px,transparent_1px)] bg-size-[16px_16px]"
      >
        <WorkflowCanvasGraph
          graph={graph}
          layout={layout}
          scale={scale}
          recentEntries={recentEntries}
          editing={editing}
          stats={stats}
        />
      </div>
      <ZoomControls
        scale={scale}
        onChange={change}
        onFit={() => setZoom(Math.max(MIN_ZOOM, fitted))}
        extra={extraControl}
      />
    </>
  );
}
