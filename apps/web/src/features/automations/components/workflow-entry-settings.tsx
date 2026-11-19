import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';

import { type AutomationGraph, MAX_EXIT_CONDITIONS } from '@dakly/contracts/automations/graph';
import { Button } from '@dakly/ui/button';
import { FormField } from '@dakly/ui/form-field';
import { Input } from '@dakly/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@dakly/ui/select';

import { removesOwnTag, type SettingsInput } from '../workflow-settings-form';

const exitLabels = {
  placed_order: 'Customer places an order (needs order exits)',
  order_confirmed: 'Order is confirmed (needs order exits)',
  order_paid: 'Order is paid (needs order exits)',
  order_cancelled: 'Order is cancelled (needs order exits)',
  got_tag: 'Customer receives a tag',
  tapped_link: 'Link tapped (needs workflow link tracking)',
  replied: 'Customer replies (needs chat exits)',
} satisfies Record<AutomationGraph['exitConditions'][number]['kind'], string>;

const reEntryLabels = {
  once: 'Once ever',
  every_days: 'Once every few days',
  every_time: 'Every time',
} satisfies Record<AutomationGraph['reEntry']['rule'], string>;

function ReEntryField({ rule }: { rule: AutomationGraph['reEntry']['rule'] }) {
  const { register, setValue } = useFormContext<SettingsInput>();
  function changeRule(rule: AutomationGraph['reEntry']['rule']) {
    setValue('reEntry', rule === 'every_days' ? { rule, days: 30 } : { rule }, {
      shouldDirty: true,
    });
  }
  return (
    <>
      <FormField name="reEntry.rule" label="Re-entry">
        {(field) => (
          <Select value={rule} onValueChange={changeRule}>
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
      {rule === 'every_days' && (
        <FormField name="reEntry.days" label="Days between entries">
          {(field) => (
            <Input
              {...field}
              {...register('reEntry.days', { valueAsNumber: true })}
              type="number"
            />
          )}
        </FormField>
      )}
    </>
  );
}

export function WorkflowEntrySettings() {
  const { control } = useFormContext<SettingsInput>();
  const [reEntry, trigger, steps] = useWatch({ control, name: ['reEntry', 'trigger', 'steps'] });
  return (
    <section
      className="space-y-4 rounded-lg border border-border bg-surface p-4"
      aria-label="Entry and exit rules"
    >
      <ReEntryField rule={reEntry?.rule ?? 'every_days'} />
      {removesOwnTag({ reEntry, trigger, steps }) && (
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
  const { fields, append, remove } = useFieldArray({ control, name: 'exitConditions' });
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
            <FormField name={`exitConditions.${index}.tag`} label="Exit tag">
              {(field) => <Input {...field} {...register(`exitConditions.${index}.tag`)} />}
            </FormField>
          )}
        </div>
      ))}
      {fields.length < MAX_EXIT_CONDITIONS && (
        <Button variant="secondary" onClick={() => append({ kind: 'got_tag', tag: '' })}>
          Add tag exit rule
        </Button>
      )}
    </div>
  );
}
