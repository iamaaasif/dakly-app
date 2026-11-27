import { Hand, Minus, Plus } from 'lucide-react';
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';

import type { AutomationGraph } from '@dakly/contracts/automations/graph';
import { Button } from '@dakly/ui/button';
import { cn } from '@dakly/ui/cn';

import {
  type Camera,
  type CameraEngine,
  createCameraEngine,
  fitCamera,
  MAX_ZOOM,
  MIN_ZOOM,
  openingCamera,
} from '../workflow-canvas-camera';
import { attachCanvasGestures, stepZoom, zoomFromCentre } from '../workflow-canvas-gestures';
import type { CanvasLayout } from '../workflow-canvas-layout';
import { WorkflowCanvasGraph } from './workflow-canvas-graph';
import type { CanvasEditing, StepStats } from './workflow-canvas-nodes';

function readSavedCamera(key: string): Camera | undefined {
  try {
    const saved: unknown = JSON.parse(sessionStorage.getItem(key) ?? 'null');
    if (typeof saved !== 'object' || saved === null) return undefined;
    const { x, y, zoom } = saved as Record<string, unknown>;
    if ([x, y, zoom].every((value) => typeof value === 'number' && Number.isFinite(value)))
      return { x, y, zoom } as Camera;
  } catch {
    // A blocked or empty store only means the canvas opens fitted.
  }
  return undefined;
}

function saveCamera(key: string, camera: Camera) {
  try {
    sessionStorage.setItem(key, JSON.stringify(camera));
  } catch {
    // The remembered view is a convenience, so a full or blocked store is not an error.
  }
}

// Owns the camera engine and the browser listeners that move it, and shows the zoom as a number.
function useCanvasCamera(layout: CanvasLayout, storageKey: string) {
  const region = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const engine = useRef<CameraEngine | null>(null);
  const flow = useRef({ width: layout.width, height: layout.height });
  flow.current = { width: layout.width, height: layout.height };
  const [zoom, setZoom] = useState(1);
  const [spaceHeld, setSpaceHeld] = useState(false);

  useLayoutEffect(() => {
    const regionNode = region.current;
    const layerNode = layer.current;
    if (!regionNode || !layerNode) return;
    const camera = createCameraEngine({
      region: regionNode,
      layer: layerNode,
      getFlow: () => flow.current,
      onZoom: (next) => setZoom(Math.round(next * 100) / 100),
      onRest: (rested) => saveCamera(storageKey, rested),
    });
    engine.current = camera;
    camera.set(readSavedCamera(storageKey) ?? openingCamera(camera.view(), flow.current));
    // Until the user moves, a resize or rotation re-opens the view at the new size.
    const observer = new ResizeObserver(() => {
      if (!camera.isTouched()) camera.set(openingCamera(camera.view(), flow.current));
    });
    observer.observe(regionNode);
    const detach = attachCanvasGestures({
      region: regionNode,
      engine: camera,
      getFlow: () => flow.current,
      onSpace: setSpaceHeld,
    });
    return () => {
      observer.disconnect();
      detach();
      camera.cancel();
    };
  }, [storageKey]);

  return { region, layer, engine, flow, zoom, spaceHeld };
}

type ZoomProps = {
  zoom: number;
  engine: CameraEngine | null;
  onFit: () => void;
  handOn: boolean;
  onHand: () => void;
  extra?: ReactNode;
};

function ZoomControls({ zoom, engine, onFit, handOn, onHand, extra }: ZoomProps) {
  const zoomTo = (direction: 1 | -1) =>
    engine && zoomFromCentre(engine, stepZoom(engine.goal().zoom, direction));
  return (
    <div
      data-canvas-controls
      className="absolute bottom-4 left-4 z-20 flex items-center overflow-hidden rounded-lg border border-border bg-surface shadow-card"
    >
      <Button
        variant="secondary"
        className="rounded-r-none border-0"
        aria-label="Zoom out"
        disabled={zoom <= MIN_ZOOM}
        onClick={() => zoomTo(-1)}
      >
        <Minus size={14} aria-hidden="true" />
      </Button>
      <span role="status" className="w-14 text-center text-sm tabular-nums">
        {Math.round(zoom * 100)}%
      </span>
      <Button
        variant="secondary"
        className="rounded-none border-0"
        aria-label="Zoom in"
        disabled={zoom >= MAX_ZOOM}
        onClick={() => zoomTo(1)}
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
      <Button
        variant="secondary"
        className={cn('rounded-none border-0 border-l border-border', handOn && 'bg-surface-muted')}
        aria-label="Hand tool"
        aria-pressed={handOn}
        onClick={onHand}
      >
        <Hand size={14} aria-hidden="true" />
      </Button>
      {extra}
    </div>
  );
}

type Props = {
  graph: AutomationGraph;
  layout: CanvasLayout;
  // Remembers the pan and zoom for this workflow while the tab is open.
  storageKey: string;
  recentEntries?: string;
  editing?: CanvasEditing;
  stats?: StepStats;
  // Sits at the end of the zoom controls.
  extraControl?: ReactNode;
};

export function WorkflowCanvasViewport({
  graph,
  layout,
  storageKey,
  recentEntries,
  editing,
  stats,
  extraControl,
}: Props) {
  const canvas = useCanvasCamera(layout, `dakly.automation-canvas.${storageKey}`);
  const [handOn, setHandOn] = useState(false);
  const panning = handOn || canvas.spaceHeld;
  useEffect(() => {
    // The page must not zoom when the pointer is over the canvas.
    const prevent = (event: Event) => event.preventDefault();
    document.addEventListener('gesturestart', prevent);
    return () => document.removeEventListener('gesturestart', prevent);
  }, []);
  return (
    <>
      <div
        ref={canvas.region}
        role="region"
        aria-label="Workflow canvas"
        tabIndex={0}
        className="absolute inset-0 cursor-grab touch-none overflow-hidden bg-[radial-gradient(var(--color-border-strong)_1px,transparent_1px)] outline-none select-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-inset data-[panning=true]:cursor-grabbing"
      >
        <div ref={canvas.layer} className="absolute top-0 left-0 origin-top-left">
          <WorkflowCanvasGraph
            graph={graph}
            layout={layout}
            recentEntries={recentEntries}
            editing={editing}
            stats={stats}
          />
        </div>
        {panning && <div aria-hidden="true" className="absolute inset-0 z-10" />}
      </div>
      <ZoomControls
        zoom={canvas.zoom}
        engine={canvas.engine.current}
        onFit={() =>
          canvas.engine.current?.animateTo(
            fitCamera(canvas.engine.current.view(), canvas.flow.current),
          )
        }
        handOn={handOn}
        onHand={() => setHandOn((on) => !on)}
        extra={extraControl}
      />
    </>
  );
}
