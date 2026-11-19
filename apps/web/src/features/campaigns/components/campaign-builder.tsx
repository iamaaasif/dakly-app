'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, MessageSquare } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState, type ReactNode } from 'react';
import { FormProvider, useForm, useFormContext } from 'react-hook-form';
import type { z } from 'zod';

import {
  campaignGoals,
  createCampaignSchema,
  type CampaignResponse,
} from '@dakly/contracts/campaigns';
import { Badge } from '@dakly/ui/badge';
import { Button } from '@dakly/ui/button';
import { cn } from '@dakly/ui/cn';
import { FormField } from '@dakly/ui/form-field';
import { Input } from '@dakly/ui/input';

import { useSaveCampaign } from '../api/save-campaign';
import {
  campaignChannelLabels,
  campaignGoalLabels,
  campaignStatusColors,
  campaignStatusLabels,
} from '../campaign-labels';
import { CampaignChannelCards } from './campaign-channel-cards';
import { formatDateTime } from '@/lib/format-date';
import { useSessionContext } from '@/lib/session-context';

const detailsSchema = createCampaignSchema.pick({ name: true, goal: true });
type DetailsInput = z.input<typeof detailsSchema>;
type Details = z.output<typeof detailsSchema>;

export function CampaignBuilder({ campaign }: { campaign?: CampaignResponse }) {
  const { data } = useSessionContext();
  const contextTag = data?.contextTag;
  const canEdit = data?.currentStore?.canEditCampaigns;
  if (!campaign) return canEdit ? <NewCampaignBuilder key={contextTag} /> : null;
  const editable = canEdit && campaign.status === 'draft';
  return (
    <main className="space-y-6 p-6 md:p-8">
      <BuilderHeader
        title={campaign.name}
        subtitle={editable ? 'Nothing is sent until you approve.' : 'Campaign summary'}
      />
      {editable ? (
        <CampaignDetailsForm key={contextTag} campaign={campaign} />
      ) : (
        <CampaignSummary campaign={campaign} />
      )}
    </main>
  );
}

const newCampaignSubtitle = 'AI campaign builder · nothing is sent until you approve';

function NewCampaignBuilder() {
  const [step, setStep] = useState<'start' | 'details' | 'channels'>('start');
  return (
    <main className="space-y-6 p-6 md:p-8">
      {step === 'details' ? (
        <CampaignDetailsForm onBack={() => setStep('channels')} />
      ) : (
        <>
          <BuilderHeader title="New campaign" subtitle={newCampaignSubtitle} />
          <CampaignChannelCards
            focusSms={step === 'channels'}
            onChooseSms={() => setStep('details')}
          />
        </>
      )}
    </main>
  );
}

function BuilderHeader({
  title,
  subtitle,
  onBack,
  backDisabled,
  action,
}: {
  title: string;
  subtitle: string;
  onBack?: () => void;
  backDisabled?: boolean;
  action?: ReactNode;
}) {
  const backIcon = <ArrowLeft aria-hidden="true" size={20} strokeWidth={1.75} />;
  return (
    <header
      className={cn(
        'grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3',
        action && 'sm:grid-cols-[auto_minmax(0,1fr)_auto]',
      )}
    >
      {onBack ? (
        <Button
          aria-label="Back to channels"
          variant="secondary"
          className="row-span-2 px-2"
          onClick={onBack}
          disabled={backDisabled}
        >
          {backIcon}
        </Button>
      ) : (
        <Link
          href="/campaigns"
          aria-label="Back to campaigns"
          className="row-span-2 inline-flex size-10 items-center justify-center rounded-md text-action hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          {backIcon}
        </Link>
      )}
      <h1 className="text-xl font-bold break-words">{title}</h1>
      <p className="col-start-2 mt-1 text-text-muted">{subtitle}</p>
      {action && (
        <div className="col-start-2 mt-3 sm:col-start-3 sm:row-start-1 sm:mt-0">{action}</div>
      )}
    </header>
  );
}

function useCampaignDetailsForm(campaign?: CampaignResponse) {
  const save = useSaveCampaign();
  const router = useRouter();
  const name = campaign?.name ?? '';
  const goal = campaign?.goal ?? null;
  const form = useForm<DetailsInput, unknown, Details>({
    resolver: zodResolver(detailsSchema, {
      error: (issue) =>
        issue.path?.[0] === 'name' && issue.code === 'too_small'
          ? 'Enter a campaign name.'
          : undefined,
    }),
    defaultValues: { name, goal },
  });
  const { dirtyFields, isDirty } = form.formState;
  const opening = !campaign && save.isSuccess;
  const submit = form.handleSubmit((input) => {
    const change = {
      ...(dirtyFields.name && { name: input.name }),
      ...(dirtyFields.goal && { goal: input.goal }),
    };
    if (campaign && !Object.keys(change).length) return;
    save.mutate(
      campaign ? { id: campaign.id, input: change } : { input: { ...input, channel: 'sms' } },
      {
        onSuccess: (saved) => {
          if (!campaign) {
            router.replace(`/campaigns/${saved.id}`);
            return;
          }
          form.reset({ name: saved.name, goal: saved.goal });
        },
      },
    );
  });
  return { form, submit, save, isDirty, opening };
}

function CampaignDetailsForm({
  campaign,
  onBack,
}: {
  campaign?: CampaignResponse;
  onBack?: () => void;
}) {
  const formId = useId();
  const { form, submit, save, isDirty, opening } = useCampaignDetailsForm(campaign);
  const busy = save.isPending || opening;
  const saved = save.isSuccess && !isDirty;
  const saveButton = (
    <Button
      type="submit"
      form={formId}
      variant={campaign ? 'primary' : 'secondary'}
      loading={save.isPending}
      disabled={opening || Boolean(campaign && !isDirty)}
    >
      Save draft
    </Button>
  );
  return (
    <>
      {!campaign && (
        <BuilderHeader
          title="New campaign"
          subtitle={newCampaignSubtitle}
          onBack={onBack}
          backDisabled={busy}
          action={saveButton}
        />
      )}
      <FormProvider {...form}>
        <form
          id={formId}
          onSubmit={submit}
          className="max-w-xl space-y-4 rounded-lg border border-border bg-surface p-5"
        >
          <fieldset className="min-w-0 space-y-4" disabled={busy}>
            <CampaignFields focusName={!campaign} />
          </fieldset>
          {save.error && (
            <p role="alert" className="text-danger">
              {save.error.message}
            </p>
          )}
          <CampaignSaveStatus opening={opening} saved={saved} />
          {campaign && saveButton}
        </form>
      </FormProvider>
    </>
  );
}

function CampaignSaveStatus({ opening, saved }: { opening: boolean; saved: boolean }) {
  if (opening) return <p role="status">Opening draft…</p>;
  if (saved) return <p role="status">Draft saved.</p>;
  return null;
}

function CampaignFields({ focusName }: { focusName: boolean }) {
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
            className="min-h-10 w-full rounded-md border border-input-border bg-surface px-3 text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
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
            <dd>{campaignGoalLabels[campaign.goal]}</dd>
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
