import { useState } from 'react';

import { type AutomationStep, MAX_WAIT_MINUTES } from '@dakly/contracts/automations/graph';
import { Button } from '@dakly/ui/button';
import { Input } from '@dakly/ui/input';
import { Label } from '@dakly/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@dakly/ui/select';
import { Sheet } from '@dakly/ui/sheet';
import { Textarea } from '@dakly/ui/textarea';

import { channelLabels } from '../automation-labels';
import { delayUnit, delayUnits, type DelayUnit, minutesPerUnit } from '../workflow-library';

type Props = {
  step: AutomationStep;
  number: number;
  onChange: (step: AutomationStep) => void;
  onClose: () => void;
};

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function DelayFields({
  label,
  minutes,
  onChange,
}: {
  label: string;
  minutes: number;
  onChange: (minutes: number) => void;
}) {
  const [unit, setUnit] = useState<DelayUnit>(delayUnit(minutes));
  const [amount, setAmount] = useState(String(minutes / minutesPerUnit[unit]));
  const total = Number(amount) * minutesPerUnit[unit];
  const valid = Number.isInteger(total) && total >= 1 && total <= MAX_WAIT_MINUTES;
  function change(nextAmount: string, nextUnit: DelayUnit) {
    setAmount(nextAmount);
    setUnit(nextUnit);
    const next = Number(nextAmount) * minutesPerUnit[nextUnit];
    if (Number.isInteger(next) && next >= 1 && next <= MAX_WAIT_MINUTES) onChange(next);
  }
  return (
    <Field label={label} error={valid ? undefined : 'Wait between 1 minute and 90 days.'}>
      <div className="flex gap-2">
        <Input
          type="number"
          min={1}
          aria-label="Amount"
          value={amount}
          aria-invalid={!valid}
          onChange={(event) => change(event.target.value, unit)}
        />
        <Select
          value={unit}
          onValueChange={(next) => {
            const chosen = delayUnits.find((item) => item === next);
            if (chosen) change(amount, chosen);
          }}
        >
          <SelectTrigger aria-label="Unit" className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {delayUnits.map((item) => (
              <SelectItem key={item} value={item}>
                {item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </Field>
  );
}

type SendStep = Extract<AutomationStep, { kind: 'send' }>;
type WaitStep = Extract<AutomationStep, { kind: 'wait' }>;

function ChannelOrder({ step, onChange }: { step: SendStep; onChange: Props['onChange'] }) {
  if (step.channels.length < 2) return null;
  function moveUp(index: number) {
    const channels = [...step.channels];
    channels.splice(index - 1, 0, ...channels.splice(index, 1));
    onChange({ ...step, channels });
  }
  return (
    <fieldset>
      <legend className="text-sm font-medium">Channel order</legend>
      <ol className="space-y-1">
        {step.channels.map((channel, index) => (
          <li key={channel} className="flex items-center justify-between gap-2">
            <span>{channelLabels[channel]}</span>
            {index > 0 && (
              <Button variant="secondary" onClick={() => moveUp(index)}>
                Move {channelLabels[channel]} up
              </Button>
            )}
          </li>
        ))}
      </ol>
    </fieldset>
  );
}

function WaitFields({ step, onChange }: { step: WaitStep; onChange: Props['onChange'] }) {
  const { wait } = step;
  if (wait.until === 'duration')
    return (
      <DelayFields
        label="Wait for"
        minutes={wait.minutes}
        onChange={(minutes) => onChange({ ...step, wait: { until: 'duration', minutes } })}
      />
    );
  if (wait.until === 'event')
    return (
      <DelayFields
        label="Give up after"
        minutes={wait.timeoutMinutes}
        onChange={(timeoutMinutes) => onChange({ ...step, wait: { ...wait, timeoutMinutes } })}
      />
    );
  if (wait.until === 'window_closing')
    return (
      <Field label="Minutes before the chat window closes">
        <Input
          type="number"
          min={1}
          max={23 * 60}
          aria-label="Minutes before"
          value={Number.isNaN(wait.minutesBefore) ? '' : wait.minutesBefore}
          onChange={(event) =>
            onChange({ ...step, wait: { ...wait, minutesBefore: event.target.valueAsNumber } })
          }
        />
      </Field>
    );
  return (
    <Field label="Time of day">
      <Input
        type="time"
        aria-label="Time of day"
        value={wait.time}
        onChange={(event) => onChange({ ...step, wait: { ...wait, time: event.target.value } })}
      />
    </Field>
  );
}

function stepFields({ step, onChange }: Pick<Props, 'step' | 'onChange'>) {
  if (step.kind === 'send') {
    const { text } = step.message;
    return (
      <>
        <p className="text-sm text-text-muted">
          Sends on {step.channels.map((channel) => channelLabels[channel]).join(', ')}.
        </p>
        <Field label="Message" error={text.trim() ? undefined : 'Write the message.'}>
          <Textarea
            aria-label="Message"
            value={text}
            maxLength={1024}
            aria-invalid={!text.trim()}
            onChange={(event) =>
              onChange({ ...step, message: { ...step.message, text: event.target.value } })
            }
          />
        </Field>
        <ChannelOrder step={step} onChange={onChange} />
      </>
    );
  }
  if (step.kind === 'wait') return <WaitFields step={step} onChange={onChange} />;
  if (
    step.kind === 'action' &&
    (step.action.action === 'add_tag' || step.action.action === 'remove_tag')
  ) {
    const { tag, action: kind } = step.action;
    return (
      <Field label="Tag" error={tag.trim() ? undefined : 'Write the tag.'}>
        <Input
          aria-label="Tag"
          value={tag}
          maxLength={50}
          aria-invalid={!tag.trim()}
          onChange={(event) =>
            onChange({ ...step, action: { action: kind, tag: event.target.value } })
          }
        />
      </Field>
    );
  }
  return null;
}

export function WorkflowStepPanel({ step, number, onChange, onClose }: Props) {
  const fields = stepFields({ step, onChange });
  return (
    <Sheet
      open
      title={`Step ${number}`}
      onClose={onClose}
      footer={<Button onClick={onClose}>Done</Button>}
    >
      <div className="space-y-4">
        {fields}
        {!fields && <p className="text-sm text-text-muted">This step has nothing to edit here.</p>}
      </div>
    </Sheet>
  );
}
