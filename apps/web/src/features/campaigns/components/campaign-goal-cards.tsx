'use client';

import { useFormContext } from 'react-hook-form';

import { campaignGoals, type CampaignGoal } from '@dakly/contracts/campaigns';

import { campaignGoalLabels } from '../campaign-labels';

// The goal decides which ready message and audience the later steps suggest.
export function CampaignGoalCards() {
  const { register } = useFormContext<{ goal: CampaignGoal | null }>();
  return (
    <fieldset className="space-y-2">
      <legend className="font-medium">What do you want from this campaign?</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {campaignGoals.map((goal) => (
          <label
            key={goal}
            className="flex min-h-12 cursor-pointer items-center rounded-md border border-border bg-surface px-4 has-checked:border-primary has-checked:bg-primary-soft has-checked:font-semibold has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus"
          >
            <input type="radio" value={goal} className="sr-only" {...register('goal')} />
            {campaignGoalLabels[goal]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
