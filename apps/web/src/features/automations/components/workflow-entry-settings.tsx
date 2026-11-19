import { useFieldArray, useFormContext, useWatch, type FieldPath } from 'react-hook-form';

import { type AutomationGraph, MAX_EXIT_CONDITIONS } from '@dakly/contracts/automations/graph';
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

type ExitKind = AutomationGraph['exitConditions'][number]['kind'];
type ReEntryRule = AutomationGraph['reEntry']['rule'];

function RuleSelect<Value extends string>({
  name,
  label,
  value,
  labels,
  onChange,
}: {
  name: FieldPath<SettingsInput>;
  label: string;
  value: Value | '';
  labels: Record<Value, string>;
  onChange: (value: Value) => void;
}) {
  return (
    <FormField name={name} label={label}>
      {(field) => (
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger {...field}>
            <SelectValue placeholder="Choose a rule" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries<string>(labels).map(([key, label]) => (
              <SelectItem key={key} value={key}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </FormField>
  );
}

export function WorkflowEntrySettings() {
  const { control, register, setValue } = useFormContext<SettingsInput>();
  const graph = useWatch({ control, name: 'graph' });
  const rule = graph.reEntry?.rule ?? 'every_days';
  function changeRule(rule: ReEntryRule) {
    setValue('graph.reEntry', rule === 'every_days' ? { rule, days: 30 } : { rule }, {
      shouldDirty: true,
    });
  }
  return (
    <section
      className="space-y-4 rounded-lg border border-border bg-surface p-4"
      aria-label="Entry and exit rules"
    >
      <RuleSelect
        name="graph.reEntry.rule"
        label="Re-entry"
        value={rule}
        labels={reEntryLabels}
        onChange={changeRule}
      />
      {rule === 'every_days' && (
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
  const { control, register } = useFormContext<SettingsInput>();
  const { fields, append, remove } = useFieldArray({ control, name: 'graph.exitConditions' });
  return (
    <div className="space-y-3">
      <h2 className="font-semibold">Exit rules</h2>
      {fields.map((exit, index) => (
        <div key={exit.id} className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>{exitLabels[exit.kind]}</span>
            <Button variant="secondary" onClick={() => remove(index)}>
              Remove exit rule {index + 1}
            </Button>
          </div>
          {exit.kind === 'got_tag' && (
            <FormField name={`graph.exitConditions.${index}.tag`} label="Exit tag">
              {(field) => <Input {...field} {...register(`graph.exitConditions.${index}.tag`)} />}
            </FormField>
          )}
        </div>
      ))}
      {fields.length < MAX_EXIT_CONDITIONS && (
        <RuleSelect
          name="graph.exitConditions"
          label="Add an exit rule"
          value=""
          labels={exitLabels}
          onChange={(kind: ExitKind) => append(kind === 'got_tag' ? { kind, tag: '' } : { kind })}
        />
      )}
    </div>
  );
}
