'use client';

import { useFormContext } from 'react-hook-form';

import { campaignGoals } from '@dakly/contracts/campaigns';
import type { ChannelConnection } from '@dakly/contracts/channels';
import { FormField } from '@dakly/ui/form-field';
import { Input } from '@dakly/ui/input';

import { campaignGoalLabels } from '../campaign-labels';
import { selectClass, type DraftInput } from './use-messenger-draft-form';

export function MessengerDetailsFields({
  pages,
  focusName,
}: {
  pages: ChannelConnection[];
  focusName: boolean;
}) {
  const { register } = useFormContext<DraftInput>();
  return (
    <>
      <div className="space-y-1">
        <h2 className="text-md font-semibold">Facebook Messenger</h2>
        <p className="text-text-muted">
          Send a photo, message and buttons to people who wrote to your Page in the last 24 hours.
        </p>
      </div>
      <FormField name="name" label="Campaign name">
        {(control) => (
          <Input
            {...control}
            {...register('name', { setValueAs: (value: string) => value.trim() })}
            aria-required="true"
            autoFocus={focusName}
          />
        )}
      </FormField>
      <FormField name="goal" label="Goal">
        {(control) => (
          <select
            {...control}
            {...register('goal', { setValueAs: (value: string) => value || null })}
            className={selectClass}
          >
            <option value="">Choose a goal</option>
            {campaignGoals.map((goal) => (
              <option key={goal} value={goal}>
                {campaignGoalLabels[goal]}
              </option>
            ))}
          </select>
        )}
      </FormField>
      <FormField name="channelConnectionId" label="Facebook Page">
        {(control) => (
          <select {...control} {...register('channelConnectionId')} className={selectClass}>
            <option value="">Choose a Page</option>
            {pages.map(({ id, displayName }) => (
              <option key={id} value={id}>
                {displayName}
              </option>
            ))}
          </select>
        )}
      </FormField>
    </>
  );
}
