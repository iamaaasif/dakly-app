import type { AutomationGraph } from '@dakly/contracts/automations/graph';

import type { CanvasLayout } from '../workflow-canvas-layout';
import { CanvasNodeItem } from './workflow-canvas-nodes';

export function WorkflowCanvasGraph({
  graph,
  layout,
  scale = 1,
  recentEntries,
}: {
  graph: AutomationGraph;
  layout: CanvasLayout;
  scale?: number;
  recentEntries?: string;
}) {
  return (
    <div className="mx-auto" style={{ width: layout.width * scale, height: layout.height * scale }}>
      <div
        className="relative origin-top-left"
        style={{ width: layout.width, height: layout.height, transform: `scale(${scale})` }}
      >
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
                className="absolute max-w-48 -translate-x-1/2 -translate-y-1/2 truncate rounded-full border border-border bg-surface px-2 text-xs text-text-muted"
                style={{ left: edge.labelX, top: edge.labelY }}
              >
                {edge.label}
              </span>
            ),
        )}
        <ol aria-label="Workflow steps">
          {layout.nodes.map((node) => (
            <CanvasNodeItem
              key={node.key}
              node={node}
              graph={graph}
              layout={layout}
              recentEntries={recentEntries}
            />
          ))}
        </ol>
      </div>
    </div>
  );
}
