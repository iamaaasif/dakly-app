import type { AutomationGraph } from '@dakly/contracts/automations/graph';
import { cn } from '@dakly/ui/cn';

import type { CanvasLayout } from '../workflow-canvas-layout';
import { EdgeAddButtons } from './workflow-add-step';
import { type CanvasEditing, CanvasNodeItem, type StepStats } from './workflow-canvas-nodes';

function EdgeLines({ layout }: { layout: CanvasLayout }) {
  return (
    <>
      <svg
        aria-hidden="true"
        width={layout.width}
        height={layout.height}
        className="absolute inset-0 fill-none stroke-border-strong"
      >
        {layout.edges.map((edge) => (
          <path key={edge.id} d={edge.path} strokeWidth={1.5} />
        ))}
      </svg>
      {layout.edges.map(
        (edge) =>
          edge.label && (
            <span
              key={edge.id}
              aria-hidden="true"
              className={cn(
                'absolute max-w-48 -translate-x-1/2 -translate-y-1/2 truncate rounded-full px-2 text-xs font-semibold',
                edge.label === 'Yes'
                  ? 'bg-success-soft text-success'
                  : 'bg-background text-text-secondary',
                edge.label !== 'Yes' &&
                  edge.label !== 'No' &&
                  'border border-border bg-surface font-normal text-text-muted',
              )}
              style={{ left: edge.labelX, top: edge.labelY }}
            >
              {edge.label}
            </span>
          ),
      )}
      {layout.merges
        .filter((merge) => merge.pill)
        .map((merge) => (
          <span
            key={merge.id}
            aria-hidden="true"
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-border bg-surface px-2.5 text-xs font-medium text-text-secondary shadow-card"
            style={{ left: merge.x, top: merge.y }}
          >
            Paths merge
          </span>
        ))}
    </>
  );
}

export function WorkflowCanvasGraph({
  graph,
  layout,
  scale = 1,
  recentEntries,
  editing,
  stats,
}: {
  graph: AutomationGraph;
  layout: CanvasLayout;
  scale?: number;
  recentEntries?: string;
  editing?: CanvasEditing;
  stats?: StepStats;
}) {
  return (
    <div className="mx-auto" style={{ width: layout.width * scale, height: layout.height * scale }}>
      <div
        className="relative origin-top-left"
        style={{ width: layout.width, height: layout.height, transform: `scale(${scale})` }}
      >
        <EdgeLines layout={layout} />
        <ol aria-label="Workflow steps">
          {layout.nodes.map((node) => (
            <CanvasNodeItem
              key={node.key}
              node={node}
              graph={graph}
              layout={layout}
              recentEntries={recentEntries}
              editing={editing}
              stats={stats}
            />
          ))}
        </ol>
        {editing && <EdgeAddButtons layout={layout} editing={editing} />}
      </div>
    </div>
  );
}
