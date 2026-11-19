import { useFormContext, useWatch } from 'react-hook-form';

import {
  type AutomationGraph,
  type AutomationStep,
  nextStepKeys,
} from '@dakly/contracts/automations/graph';
import { Button } from '@dakly/ui/button';
import { FormField } from '@dakly/ui/form-field';
import { Input } from '@dakly/ui/input';
import { Textarea } from '@dakly/ui/textarea';

import { channelLabels } from '../automation-labels';
import type { SettingsInput } from '../workflow-settings-form';

const delayField = {
  duration: 'minutes',
  event: 'timeoutMinutes',
  window_closing: 'minutesBefore',
  weekday: 'time',
  time_of_day: 'time',
} as const;

type Wait = Extract<AutomationStep, { kind: 'wait' }>['wait'];

function DelayFields({ stepKey, wait }: { stepKey: string; wait: Wait }) {
  const { register } = useFormContext<SettingsInput>();
  const field = delayField[wait.until];
  const name = `graph.steps.${stepKey}.wait.${field}` as const;
  const isTime = field === 'time';
  return (
    <FormField name={name} label={isTime ? 'Time of day' : 'Delay in minutes'}>
      {(control) => (
        <Input
          {...control}
          type={isTime ? 'time' : 'number'}
          {...register(name, { valueAsNumber: !isTime })}
        />
      )}
    </FormField>
  );
}

type SendStep = Extract<AutomationStep, { kind: 'send' }>;

function MessageFields({ stepKey, step }: { stepKey: string; step: SendStep }) {
  const { register, setValue } = useFormContext<SettingsInput>();
  const text = `graph.steps.${stepKey}.message.text` as const;
  function moveUp(channel: SendStep['channels'][number], index: number) {
    const channels = [...step.channels];
    channels.splice(index, 1);
    channels.splice(index - 1, 0, channel!);
    setValue(`graph.steps.${stepKey}.channels`, channels, { shouldDirty: true });
  }
  return (
    <div className="space-y-3">
      <FormField name={text} label="Message text">
        {(control) => <Textarea {...control} {...register(text)} rows={3} />}
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
  const steps: [string, AutomationStep][] = [];
  function visit(key: string) {
    if (seen.has(key)) return;
    seen.add(key);
    const step = graph.steps[key]!;
    if (step.kind === 'wait' || step.kind === 'send') steps.push([key, step]);
    nextStepKeys(step).forEach(visit);
  }
  visit(graph.firstStepKey);
  return steps;
}

export function WorkflowStepSettings() {
  const { control } = useFormContext<SettingsInput>();
  const graph = useWatch({ control, name: 'graph' });
  const steps = orderedEditableSteps(graph);
  if (!steps.length) return null;
  return (
    <section className="space-y-4" aria-label="Workflow steps">
      {steps.map(([key, step], index) => (
        <div key={key} className="space-y-3 rounded-lg border border-border bg-surface p-4">
          <h2 className="font-semibold">
            {index + 1}. {step.kind === 'wait' ? 'Wait' : 'Send a message'}
          </h2>
          {step.kind === 'wait' && <DelayFields stepKey={key} wait={step.wait} />}
          {step.kind === 'send' && <MessageFields stepKey={key} step={step} />}
        </div>
      ))}
    </section>
  );
}
