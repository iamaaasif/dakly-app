import { type AutomationGraph, MAX_EXIT_CONDITIONS } from '@dakly/contracts/automations/graph';
import { Button } from '@dakly/ui/button';
import { Input } from '@dakly/ui/input';
import { Label } from '@dakly/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@dakly/ui/select';
import { Sheet } from '@dakly/ui/sheet';

import { removesOwnTag } from '../workflow-settings-form';

type Rule = AutomationGraph['reEntry']['rule'];

const exitLabels = {
  placed_order: 'Customer places an order (needs order exits)',
  order_confirmed: 'Order is confirmed',
  order_paid: 'Order is paid (needs order exits)',
  order_cancelled: 'Order is cancelled',
  got_tag: 'Customer receives a tag',
  tapped_link: 'Link tapped (needs workflow link tracking)',
  replied: 'Customer replies (needs chat exits)',
} satisfies Record<AutomationGraph['exitConditions'][number]['kind'], string>;

const reEntryLabels = {
  once: 'Once ever',
  every_days: 'Once every few days',
  every_time: 'Every time',
} satisfies Record<Rule, string>;

type Props = {
  graph: AutomationGraph;
  onChange: (graph: AutomationGraph) => void;
  onClose: () => void;
};

function ReEntry({ graph, onChange }: Pick<Props, 'graph' | 'onChange'>) {
  const { reEntry } = graph;
  function changeRule(rule: Rule) {
    onChange({ ...graph, reEntry: rule === 'every_days' ? { rule, days: 30 } : { rule } });
  }
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Re-entry</Label>
        <Select
          value={reEntry.rule}
          onValueChange={(next) => {
            const rule = (Object.keys(reEntryLabels) as Rule[]).find((key) => key === next);
            if (rule) changeRule(rule);
          }}
        >
          <SelectTrigger aria-label="Re-entry">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(reEntryLabels).map(([key, label]) => (
              <SelectItem key={key} value={key}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {reEntry.rule === 'every_days' && (
        <div className="space-y-1.5">
          <Label>Days between entries</Label>
          <Input
            type="number"
            min={1}
            aria-label="Days between entries"
            value={Number.isNaN(reEntry.days) ? '' : reEntry.days}
            onChange={(event) =>
              onChange({
                ...graph,
                reEntry: { rule: 'every_days', days: event.target.valueAsNumber },
              })
            }
          />
        </div>
      )}
      {removesOwnTag(graph) && (
        <p role="status" className="text-sm text-warning">
          This workflow removes its trigger tag. Adding that tag again can restart the workflow.
        </p>
      )}
    </div>
  );
}

function ExitRules({ graph, onChange }: Pick<Props, 'graph' | 'onChange'>) {
  const exits = graph.exitConditions;
  function setExits(next: typeof exits) {
    onChange({ ...graph, exitConditions: next });
  }
  return (
    <div className="space-y-3">
      <h3 className="font-semibold">Exit rules</h3>
      {exits.map((exit, index) => (
        <div key={index} className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>{exitLabels[exit.kind]}</span>
            <Button
              variant="secondary"
              onClick={() => setExits(exits.filter((_, position) => position !== index))}
            >
              Remove exit rule {index + 1}
            </Button>
          </div>
          {exit.kind === 'got_tag' && (
            <div className="space-y-1.5">
              <Label>Exit tag</Label>
              <Input
                aria-label="Exit tag"
                value={exit.tag}
                onChange={(event) =>
                  setExits(
                    exits.map((item, position) =>
                      position === index ? { kind: 'got_tag', tag: event.target.value } : item,
                    ),
                  )
                }
              />
            </div>
          )}
        </div>
      ))}
      {exits.length < MAX_EXIT_CONDITIONS && (
        <Button
          variant="secondary"
          onClick={() => setExits([...exits, { kind: 'got_tag', tag: '' }])}
        >
          Add tag exit rule
        </Button>
      )}
    </div>
  );
}

export function WorkflowSettingsSheet({ graph, onChange, onClose }: Props) {
  return (
    <Sheet
      open
      title="Workflow settings"
      onClose={onClose}
      footer={<Button onClick={onClose}>Done</Button>}
    >
      <div className="space-y-6">
        <ReEntry graph={graph} onChange={onChange} />
        <ExitRules graph={graph} onChange={onChange} />
      </div>
    </Sheet>
  );
}
