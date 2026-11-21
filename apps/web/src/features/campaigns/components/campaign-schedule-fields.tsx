'use client';

import { useFormContext, useWatch } from 'react-hook-form';

import type { CampaignApprovalFailureCode, CampaignChannel } from '@dakly/contracts/campaigns';
import { cn } from '@dakly/ui/cn';
import { Input } from '@dakly/ui/input';
import { Label } from '@dakly/ui/label';

import { scheduleProblem, type ScheduleInput } from './campaign-schedule';

type ScheduleForm = { schedule: ScheduleInput };

const choices = [
  { mode: 'now', label: 'Send now', hint: 'Starts within a few minutes of your approval.' },
  { mode: 'later', label: 'Schedule for later', hint: 'Pick a date and time.' },
] as const;

const failureText: Record<CampaignApprovalFailureCode, string> = {
  WALLET_BALANCE_TOO_LOW:
    'Your SMS balance was too low to cover this campaign. Buy credits, then approve it again.',
  CAMPAIGN_NO_RECIPIENTS:
    'No one in this audience can get this message. Change the audience, then approve it again.',
  CAMPAIGN_SEND_TIME_PASSED:
    'The send time passed while the audience was being checked. Pick a new time.',
  SEGMENT_NOT_FOUND:
    'A segment in this audience was deleted. Choose the audience again, then approve it.',
};

export function CampaignScheduleFields({
  channel,
  failureCode,
}: {
  channel: CampaignChannel;
  failureCode: CampaignApprovalFailureCode | null;
}) {
  const { register, control } = useFormContext<ScheduleForm>();
  const schedule = useWatch({ control, name: 'schedule' });
  const later = schedule.mode === 'later';
  const problem = scheduleProblem(schedule, channel, new Date());
  return (
    <>
      <div className="space-y-1">
        <h2 className="text-md font-semibold">When should it go out?</h2>
        <p className="text-text-muted">Send now or pick a time. Times are Bangladesh time.</p>
      </div>
      {failureCode && (
        <p role="alert" className="text-danger">
          {failureText[failureCode]}
        </p>
      )}
      <SendChoices />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="schedule-date">Date</Label>
          <Input
            id="schedule-date"
            type="date"
            disabled={!later}
            aria-invalid={later && Boolean(problem)}
            aria-describedby={later && problem ? 'schedule-problem' : undefined}
            {...register('schedule.date')}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="schedule-time">Time</Label>
          <Input
            id="schedule-time"
            type="time"
            disabled={!later}
            aria-invalid={later && Boolean(problem)}
            aria-describedby={later && problem ? 'schedule-problem' : undefined}
            {...register('schedule.time')}
          />
        </div>
      </div>
      {later && problem && (
        <p id="schedule-problem" role="alert" className="text-sm text-danger">
          {problem}
        </p>
      )}
    </>
  );
}

function SendChoices() {
  const { register, control } = useFormContext<ScheduleForm>();
  const chosen = useWatch({ control, name: 'schedule.mode' });
  return (
    <fieldset className="space-y-3">
      <legend className="sr-only">Send time</legend>
      {choices.map(({ mode, label, hint }) => (
        <label
          key={mode}
          className={cn(
            'flex min-h-14 cursor-pointer items-start gap-3 rounded-lg border bg-surface p-4 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus',
            chosen === mode ? 'border-primary bg-primary-soft' : 'border-border',
          )}
        >
          <input
            type="radio"
            value={mode}
            className="mt-1 size-4 accent-action"
            {...register('schedule.mode')}
          />
          <span>
            <span className="block font-semibold">{label}</span>
            <span className="block text-sm text-text-muted">{hint}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
