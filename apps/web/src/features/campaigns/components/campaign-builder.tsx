'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { MessageSquare } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef } from 'react';
import { FormProvider, useForm, useFormContext, useWatch } from 'react-hook-form';
import type { z } from 'zod';

import {
  campaignGoals,
  createCampaignSchema,
  type CampaignGoal,
  type CampaignResponse,
} from '@dakly/contracts/campaigns';
import { Badge } from '@dakly/ui/badge';
import { Button } from '@dakly/ui/button';
import { FormField } from '@dakly/ui/form-field';
import { Input } from '@dakly/ui/input';

import { useSaveCampaign } from '../api/save-campaign';
import {
  campaignChannelLabels,
  campaignStatusColors,
  campaignStatusLabels,
} from '../campaign-labels';
import { formatDateTime } from '@/lib/format-date';
import { useSessionContext } from '@/lib/session-context';

const detailsSchema = createCampaignSchema.pick({ name: true, goal: true });
type DetailsInput = z.input<typeof detailsSchema>;
type Details = z.output<typeof detailsSchema>;

const goals: Record<CampaignGoal, string> = {
  win_back: 'Win back customers',
  repeat_purchase: 'Increase repeat purchases',
  new_collection: 'Promote a new collection',
  vip_offer: 'Offer for VIP customers',
  discount: 'Announce a discount',
  clearance: 'Clearance',
  best_sellers: 'Promote best sellers',
  welcome: 'Welcome new customers',
  seasonal: 'Seasonal campaign',
  from_scratch: 'Start from scratch',
};

export function CampaignBuilder({ campaign }: { campaign?: CampaignResponse }) {
  const { data } = useSessionContext();
  const editable =
    data?.currentStore?.canEditCampaigns && (!campaign || campaign.status === 'draft');
  return (
    <main className="space-y-6 p-6 md:p-8">
      <BuilderHeader title={campaign?.name ?? 'New campaign'} editable={Boolean(editable)} />
      {editable ? (
        <CampaignDetailsForm key={data?.contextTag} campaign={campaign} />
      ) : (
        campaign && <CampaignSummary campaign={campaign} />
      )}
    </main>
  );
}

function BuilderHeader({ title, editable }: { title: string; editable: boolean }) {
  return (
    <header className="flex items-start gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-bold break-words">{title}</h1>
        <p className="mt-1 text-text-muted">
          {editable ? 'Nothing is sent until you approve.' : 'Campaign summary'}
        </p>
      </div>
    </header>
  );
}

function detailChanges(
  input: Details,
  defaults: Details,
  dirty: Partial<Record<keyof DetailsInput, boolean>>,
): Partial<Details> {
  return {
    ...(dirty.name && input.name !== defaults.name && { name: input.name }),
    ...(dirty.goal && input.goal !== defaults.goal && { goal: input.goal }),
  };
}

function useCampaignDetailsForm(campaign?: CampaignResponse) {
  const save = useSaveCampaign();
  const router = useRouter();
  const requestInFlight = useRef(false);
  const values = { name: campaign?.name ?? '', goal: campaign?.goal ?? null };
  const form = useForm<DetailsInput, unknown, Details>({
    resolver: zodResolver(detailsSchema, {
      error: (issue) =>
        issue.path?.[0] === 'name' && issue.code === 'too_small'
          ? 'Enter a campaign name.'
          : undefined,
    }),
    defaultValues: values,
    values,
    resetOptions: { keepDirtyValues: true, keepErrors: true },
  });
  const { dirtyFields } = form.formState;
  const [name, goal] = useWatch({ control: form.control, name: ['name', 'goal'] });
  const hasEdits = name !== values.name || (goal ?? null) !== values.goal;
  const submit = form.handleSubmit((input) => {
    if (requestInFlight.current) return;
    const change = detailChanges(input, values, dirtyFields);
    if (campaign && !Object.keys(change).length) {
      form.reset(input);
      return;
    }
    const request = campaign
      ? { id: campaign.id, input: change }
      : { input: createCampaignSchema.parse({ ...input, channel: 'sms' }) };
    requestInFlight.current = true;
    save.mutate(request, {
      onSuccess: (saved) => {
        if (campaign) {
          form.reset({ name: saved.name, goal: saved.goal });
          requestInFlight.current = false;
        } else router.replace(`/campaigns/${saved.id}`);
      },
      onError: () => {
        requestInFlight.current = false;
      },
    });
  });
  return { form, submit, save, hasEdits };
}

function CampaignDetailsForm({ campaign }: { campaign?: CampaignResponse }) {
  const { form, submit, save, hasEdits } = useCampaignDetailsForm(campaign);
  const opening = !campaign && save.isSuccess;
  const saved = save.isSuccess && !hasEdits;
  return (
    <FormProvider {...form}>
      <form
        onSubmit={submit}
        className="max-w-xl space-y-4 rounded-lg border border-border bg-surface p-5"
      >
        <fieldset className="min-w-0 space-y-4" disabled={save.isPending || opening}>
          <CampaignFields />
        </fieldset>
        {save.error && (
          <p role="alert" className="text-danger">
            {save.error.message}
          </p>
        )}
        {opening ? <p role="status">Opening draft…</p> : saved && <p role="status">Draft saved.</p>}
        <Button
          type="submit"
          loading={save.isPending}
          disabled={opening || Boolean(campaign && !hasEdits)}
        >
          {campaign ? 'Save draft' : 'Create SMS draft'}
        </Button>
      </form>
    </FormProvider>
  );
}

function CampaignFields() {
  const { register } = useFormContext<DetailsInput>();
  return (
    <>
      <div className="space-y-2">
        <span className="inline-flex size-10 items-center justify-center rounded-md bg-primary-soft text-action">
          <MessageSquare aria-hidden="true" size={20} strokeWidth={1.75} />
        </span>
        <h2 className="text-md font-semibold">SMS</h2>
        <p className="text-text-muted">Send a short text to customers who agreed to receive SMS.</p>
      </div>
      <FormField name="name" label="Campaign name">
        {(control) => <Input {...control} {...register('name')} aria-required="true" />}
      </FormField>
      <FormField name="goal" label="Goal">
        {(control) => (
          <select
            {...control}
            {...register('goal', { setValueAs: (value: string) => value || null })}
            className="min-h-10 w-full rounded-md border border-input-border bg-surface px-3 text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            <option value="">Choose a goal</option>
            {campaignGoals.map((goal) => (
              <option key={goal} value={goal}>
                {goals[goal]}
              </option>
            ))}
          </select>
        )}
      </FormField>
    </>
  );
}

function CampaignSummary({ campaign }: { campaign: CampaignResponse }) {
  return (
    <section
      aria-label="Saved campaign"
      className="max-w-xl space-y-4 rounded-lg border border-border bg-surface p-5"
    >
      <Badge variant={campaignStatusColors[campaign.status]}>
        {campaignStatusLabels[campaign.status]}
      </Badge>
      <dl className="space-y-3">
        <div>
          <dt className="text-sm text-text-muted">Channel</dt>
          <dd>{campaignChannelLabels[campaign.channel]}</dd>
        </div>
        {campaign.goal && (
          <div>
            <dt className="text-sm text-text-muted">Goal</dt>
            <dd>{goals[campaign.goal]}</dd>
          </div>
        )}
        {campaign.scheduledFor && (
          <div>
            <dt className="text-sm text-text-muted">Scheduled time</dt>
            <dd>
              <time dateTime={campaign.scheduledFor}>{formatDateTime(campaign.scheduledFor)}</time>
            </dd>
          </div>
        )}
        {campaign.content.text && (
          <div>
            <dt className="text-sm text-text-muted">Message</dt>
            <dd className="break-words whitespace-pre-wrap">{campaign.content.text}</dd>
          </div>
        )}
      </dl>
    </section>
  );
}
