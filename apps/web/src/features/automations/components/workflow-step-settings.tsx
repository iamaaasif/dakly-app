import { useFormContext, useWatch } from 'react-hook-form';

import type { AutomationStep } from '@dakly/contracts/automations/graph';
import { Button } from '@dakly/ui/button';
import { FormField } from '@dakly/ui/form-field';
import { Input } from '@dakly/ui/input';
import { Textarea } from '@dakly/ui/textarea';

import { channelLabels } from '../automation-labels';
import type { SettingsInput } from '../workflow-settings-form';

function DelayFields({
  stepKey,
  wait,
}: {
  stepKey: string;
  wait: Extract<AutomationStep, { kind: 'wait' }>['wait'];
}) {
  const { register } = useFormContext<SettingsInput>();
  const prefix = `graph.steps.${stepKey}.wait` as const;
  if (wait.until === 'duration' || wait.until === 'event' || wait.until === 'window_closing') {
    const field = {
      duration: 'minutes',
      event: 'timeoutMinutes',
      window_closing: 'minutesBefore',
    } as const;
    const name = `${prefix}.${field[wait.until]}` as const;
    return (
      <FormField name={name} label="Delay in minutes">
        {(control) => (
          <Input {...control} type="number" min={1} {...register(name, { valueAsNumber: true })} />
        )}
      </FormField>
    );
  }
  const name = `${prefix}.time` as const;
  return (
    <FormField name={name} label="Time of day">
      {(control) => <Input {...control} type="time" {...register(name)} />}
    </FormField>
  );
}

function MessageFields({
  stepKey,
  step,
}: {
  stepKey: string;
  step: Extract<AutomationStep, { kind: 'send' }>;
}) {
  const { register, setValue } = useFormContext<SettingsInput>();
  const text = `graph.steps.${stepKey}.message.text` as const;
  const channels = `graph.steps.${stepKey}.channels` as const;
  const update = (value: typeof step.channels) =>
    setValue(channels, value, { shouldDirty: true, shouldValidate: true });
  return (
    <div className="space-y-3">
      <FormField name={text} label="Message text">
        {(control) => <Textarea {...control} {...register(text)} rows={3} maxLength={1024} />}
      </FormField>
      <ChannelOrder channels={step.channels} update={update} />
    </div>
  );
}

function ChannelOrder({
  channels,
  update,
}: {
  channels: Extract<AutomationStep, { kind: 'send' }>['channels'];
  update: (value: Extract<AutomationStep, { kind: 'send' }>['channels']) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Channel order</legend>
      <ol className="space-y-1">
        {channels.map((channel, index) => (
          <li key={channel} className="flex flex-wrap items-center gap-2">
            <span className="mr-auto text-sm">{channelLabels[channel]}</span>
            <Button
              variant="secondary"
              disabled={index === 0}
              aria-label={`Move ${channelLabels[channel]} up`}
              onClick={() => {
                const order = [...channels];
                order.splice(index, 1);
                order.splice(index - 1, 0, channel);
                update(order);
              }}
            >
              Move up
            </Button>
          </li>
        ))}
      </ol>
    </fieldset>
  );
}

export function WorkflowStepSettings() {
  const { control, setValue } = useFormContext<SettingsInput>();
  const graph = useWatch({ control, name: 'graph' });
  const steps = Object.entries(graph.steps).filter(
    ([, step]) => step.kind === 'wait' || step.kind === 'send',
  );
  function addMessage() {
    setValue(
      'graph',
      {
        ...graph,
        firstStepKey: 'message',
        steps: {
          ...graph.steps,
          message: {
            kind: 'send',
            category: 'marketing',
            channels: ['sms'],
            message: { text: '', buttons: [] },
            next: graph.firstStepKey,
            ifNotReachable: 'skip',
            reviewBeforeSending: false,
          },
        },
      },
      { shouldDirty: true },
    );
  }
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
      {steps.length === 0 && graph.steps[graph.firstStepKey]?.kind === 'exit' && (
        <Button variant="secondary" onClick={addMessage}>
          Add a message
        </Button>
      )}
    </section>
  );
}
