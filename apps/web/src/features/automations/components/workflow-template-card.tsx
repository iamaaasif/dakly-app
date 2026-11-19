import { ArrowRight, Zap } from 'lucide-react';

import { Badge } from '@dakly/ui/badge';
import { Button } from '@dakly/ui/button';
import { cn } from '@dakly/ui/cn';

import { channelLabels, triggerLabels } from '../automation-labels';
import {
  stepLabel,
  templateRequirement,
  templateTypeLabels,
  type WorkflowTemplateCard,
} from '../workflow-library';

export function TemplateCard({
  template,
  inUse,
  pending,
  onUse,
}: {
  template: WorkflowTemplateCard;
  inUse: boolean;
  pending: boolean;
  onUse: () => void;
}) {
  return (
    <article className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold tracking-wide text-text-muted uppercase">
          {templateTypeLabels[template.category]}
        </p>
        {inUse && <Badge>In use</Badge>}
      </div>
      <h3 className="font-semibold">{template.name}</h3>
      <p className="text-sm">{template.description}</p>
      <p className="flex items-start gap-2 text-sm text-text-muted">
        <Zap size={15} className="mt-0.5 shrink-0 text-action" aria-hidden="true" /> Starts when{' '}
        {triggerLabels[template.graph.trigger.key]}
      </p>
      <ol className="flex flex-wrap items-center gap-2">
        {Object.entries(template.graph.steps)
          .filter(([, step]) => step.kind !== 'exit')
          .map(([id, step], index) => (
            <li key={id} className="flex items-center gap-2">
              {index > 0 && <ArrowRight size={12} className="text-text-muted" aria-hidden="true" />}
              <Badge>{stepLabel(step)}</Badge>
            </li>
          ))}
      </ol>
      <div
        className={cn(
          'mt-auto border-t border-border pt-3',
          template.available ? 'flex items-center justify-between gap-2' : 'space-y-2',
        )}
      >
        <p className="min-w-0 text-xs text-text-muted">
          {template.channels.map((key) => channelLabels[key]).join(' · ')}
        </p>
        {template.available ? (
          <Button className="shrink-0" disabled={pending} onClick={onUse}>
            Use workflow<span className="sr-only"> {template.name}</span>
          </Button>
        ) : (
          <p className="text-sm text-text-muted">{templateRequirement(template)}</p>
        )}
      </div>
    </article>
  );
}
