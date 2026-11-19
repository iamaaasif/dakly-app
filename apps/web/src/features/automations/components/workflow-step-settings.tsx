import { useFormContext, useWatch } from 'react-hook-form';

import type { AutomationStep } from '@dakly/contracts/automations/graph';
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
  const { control } = useFormContext<SettingsInput>();
  const graph = useWatch({ control, name: 'graph' });
  const steps = Object.entries(graph.steps).filter(
    ([, step]) => step.kind === 'wait' || step.kind === 'send',
  );
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
