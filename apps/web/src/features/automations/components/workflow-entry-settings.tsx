import { useFormContext, useWatch } from 'react-hook-form';

import type { AutomationGraph } from '@dakly/contracts/automations/graph';
import { MAX_EXIT_CONDITIONS } from '@dakly/contracts/automations/graph';
import { Button } from '@dakly/ui/button';
import { FormField } from '@dakly/ui/form-field';
import { Input } from '@dakly/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@dakly/ui/select';

import {
  exitLabels,
  reEntryLabels,
  removesOwnTag,
  type SettingsInput,
} from '../workflow-settings-form';

type ExitCondition = AutomationGraph['exitConditions'][number];

export function WorkflowEntrySettings() {
  const { control, register, setValue } = useFormContext<SettingsInput>();
  const graph = useWatch({ control, name: 'graph' });
  const reEntry = graph.reEntry ?? { rule: 'every_days', days: 30 };
  return (
    <section
      className="space-y-4 rounded-lg border border-border bg-surface p-4"
      aria-label="Entry and exit rules"
    >
      <FormField name="graph.reEntry.rule" label="Re-entry">
        {(field) => (
          <Select
            value={reEntry.rule}
            onValueChange={(value: AutomationGraph['reEntry']['rule']) =>
              setValue(
                'graph.reEntry',
                value === 'every_days' ? { rule: value, days: 30 } : { rule: value },
                { shouldDirty: true },
              )
            }
          >
            <SelectTrigger {...field}>
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
        )}
      </FormField>
      {reEntry.rule === 'every_days' && (
        <FormField name="graph.reEntry.days" label="Days between entries">
          {(field) => (
            <Input
              {...field}
              {...register('graph.reEntry.days', { valueAsNumber: true })}
              type="number"
              min={1}
              max={365}
            />
          )}
        </FormField>
      )}
      {removesOwnTag(graph) && (
        <p role="status" className="text-sm text-warning">
          This workflow removes its trigger tag. Adding that tag again can restart the workflow.
        </p>
      )}
      <ExitRules />
    </section>
  );
}

function ExitRules() {
  const { control, register, setValue } = useFormContext<SettingsInput>();
  const exits = useWatch({ control, name: 'graph.exitConditions' });
  const update = (value: ExitCondition[]) =>
    setValue('graph.exitConditions', value, { shouldDirty: true });
  return (
    <fieldset className="space-y-3">
      <legend className="mb-3 font-semibold">Exit rules</legend>
      {exits.map((exit, index) => (
        <div key={index} className="space-y-2">
          <FormField name={`graph.exitConditions.${index}.kind`} label={`Exit rule ${index + 1}`}>
            {(field) => (
              <Select
                value={exit.kind}
                onValueChange={(kind: ExitCondition['kind']) =>
                  update(
                    exits.map((item, position) => {
                      if (position !== index) return item;
                      return kind === 'got_tag' ? { kind, tag: '' } : { kind };
                    }),
                  )
                }
              >
                <SelectTrigger {...field}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(exitLabels).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
          {exit.kind === 'got_tag' && (
            <FormField name={`graph.exitConditions.${index}.tag`} label="Exit tag">
              {(field) => <Input {...field} {...register(`graph.exitConditions.${index}.tag`)} />}
            </FormField>
          )}
          <Button
            variant="secondary"
            onClick={() => update(exits.filter((_, position) => position !== index))}
          >
            Remove exit rule {index + 1}
          </Button>
        </div>
      ))}
      <Button
        variant="secondary"
        disabled={exits.length >= MAX_EXIT_CONDITIONS}
        onClick={() => update([...exits, { kind: 'placed_order' }])}
      >
        Add exit rule
      </Button>
    </fieldset>
  );
}
