import Link from 'next/link';
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
  settingsHref: string;
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
  minutes,
  onChange,
}: {
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
    <Field label="Wait for" error={valid ? undefined : 'Wait between 1 minute and 90 days.'}>
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
      </>
    );
  }
  if (step.kind === 'wait' && step.wait.until === 'duration') {
    return (
      <DelayFields
        minutes={step.wait.minutes}
        onChange={(minutes) => onChange({ ...step, wait: { until: 'duration', minutes } })}
      />
    );
  }
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

export function WorkflowStepPanel({ step, number, settingsHref, onChange, onClose }: Props) {
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
        {!fields && (
          <p className="text-sm text-text-muted">
            This step is edited in the{' '}
            <Link href={settingsHref} className="font-semibold text-action-hover underline">
              workflow settings
            </Link>
            .
          </p>
        )}
      </div>
    </Sheet>
  );
}
