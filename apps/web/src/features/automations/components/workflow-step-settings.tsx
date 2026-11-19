import { useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';

import {
  type AutomationGraph,
  type AutomationStep,
  nextStepKeys,
} from '@dakly/contracts/automations/graph';
import { Button } from '@dakly/ui/button';
import { FormField } from '@dakly/ui/form-field';
import { Input } from '@dakly/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@dakly/ui/select';
import { Textarea } from '@dakly/ui/textarea';

import { channelLabels } from '../automation-labels';
import { delayUnit, type DelayUnit, minutesPerUnit } from '../workflow-library';
import type { SettingsInput } from '../workflow-settings-form';

type WaitStep = Extract<AutomationStep, { kind: 'wait' }>;
type SendStep = Extract<AutomationStep, { kind: 'send' }>;
type StepSettings<Step> = { stepKey: string; step: Step; update: (step: Step) => void };

function delayValue(wait: WaitStep['wait']) {
  if ('time' in wait) return { field: 'time', value: wait.time };
  if (wait.until === 'duration') return { field: 'minutes', value: wait.minutes };
  if (wait.until === 'event') return { field: 'timeoutMinutes', value: wait.timeoutMinutes };
  return { field: 'minutesBefore', value: wait.minutesBefore };
}

function DelayFields({ stepKey, step, update }: StepSettings<WaitStep>) {
  const { field, value } = delayValue(step.wait);
  const [unit, setUnit] = useState(() =>
    typeof value === 'number' ? delayUnit(value) : 'minutes',
  );
  const numeric = typeof value === 'number';
  const amount = numeric ? value / minutesPerUnit[unit] : value;
  function change(value: string | number, unit: DelayUnit) {
    update({
      ...step,
      wait: {
        ...step.wait,
        [field]: typeof value === 'number' ? value * minutesPerUnit[unit] : value,
      },
    });
  }
  return (
    <FormField name={`steps.${stepKey}.wait.${field}`} label={numeric ? 'Delay' : 'Time of day'}>
      {(control) => (
        <div className="flex gap-2">
          <Input
            {...control}
            type={numeric ? 'number' : 'time'}
            value={Number.isNaN(amount) ? '' : amount}
            onChange={({ target }) => change(numeric ? target.valueAsNumber : target.value, unit)}
          />
          {numeric && (
            <Select
              value={unit}
              onValueChange={(next: DelayUnit) => {
                setUnit(next);
                change(amount, next);
              }}
            >
              <SelectTrigger aria-label="Delay unit" className="w-32 shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="minutes">Minutes</SelectItem>
                <SelectItem value="hours">Hours</SelectItem>
                <SelectItem value="days">Days</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
      )}
    </FormField>
  );
}

function MessageFields({ stepKey, step, update }: StepSettings<SendStep>) {
  function moveUp(channel: SendStep['channels'][number], index: number) {
    const channels = [...step.channels];
    channels.splice(index, 1);
    channels.splice(index - 1, 0, channel);
    update({ ...step, channels });
  }
  return (
    <div className="space-y-3">
      <FormField name={`steps.${stepKey}.message.text`} label="Message text">
        {(control) => (
          <Textarea
            {...control}
            value={step.message.text}
            rows={3}
            onChange={({ target }) =>
              update({ ...step, message: { ...step.message, text: target.value } })
            }
          />
        )}
      </FormField>
      <fieldset>
        <legend className="text-sm font-medium">Channel order</legend>
        <ol className="space-y-1">
          {step.channels.map((channel, index) => (
            <li key={channel} className="flex items-center justify-between gap-2">
              <span>{channelLabels[channel]}</span>
              {index > 0 && (
                <Button variant="secondary" onClick={() => moveUp(channel, index)}>
                  Move {channelLabels[channel]} up
                </Button>
              )}
            </li>
          ))}
        </ol>
      </fieldset>
    </div>
  );
}

function orderedEditableSteps(graph: Pick<AutomationGraph, 'firstStepKey' | 'steps'>) {
  const seen = new Set<string>();
  const steps: [string, WaitStep | SendStep][] = [];
  function visit(key: string) {
    if (seen.has(key) || !Object.hasOwn(graph.steps, key)) return;
    seen.add(key);
    const step = graph.steps[key]!;
    if (step.kind === 'wait' || step.kind === 'send') steps.push([key, step]);
    nextStepKeys(step).forEach(visit);
  }
  visit(graph.firstStepKey);
  return steps;
}

export function WorkflowStepSettings() {
  const { control, getValues, setValue, formState } = useFormContext<SettingsInput>();
  const [firstStepKey, stepsByKey] = useWatch({ control, name: ['firstStepKey', 'steps'] });
  const steps = orderedEditableSteps({ firstStepKey, steps: stepsByKey });
  if (!steps.length) return null;

  function update(key: string, step: AutomationStep) {
    // Step keys belong to the graph, including keys React Hook Form reserves in field paths.
    const next = { ...getValues('steps'), [key]: step };
    setValue('steps', next, { shouldDirty: true, shouldValidate: formState.isSubmitted });
  }
  return (
    <section className="space-y-4" aria-label="Workflow steps">
      {steps.map(([key, step], index) => (
        <div key={key} className="space-y-3 rounded-lg border border-border bg-surface p-4">
          <h2 className="font-semibold">
            {index + 1}. {step.kind === 'wait' ? 'Wait' : 'Send a message'}
          </h2>
          {step.kind === 'wait' ? (
            <DelayFields stepKey={key} step={step} update={(value) => update(key, value)} />
          ) : (
            <MessageFields stepKey={key} step={step} update={(value) => update(key, value)} />
          )}
        </div>
      ))}
    </section>
  );
}
