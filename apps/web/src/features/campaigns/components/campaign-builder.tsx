'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { MessageSquare } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { FormProvider, useForm, useFormContext } from 'react-hook-form';
import type { z } from 'zod';

import { campaignDetailsSchema, type CampaignResponse } from '@dakly/contracts/campaigns';
import { formatCount } from '@dakly/contracts/money';
import { Badge } from '@dakly/ui/badge';
import { Button } from '@dakly/ui/button';
import { FormField } from '@dakly/ui/form-field';
import { Input } from '@dakly/ui/input';

import { useMessengerPages } from '../api/campaign-pages';
import { useSaveCampaign } from '../api/save-campaign';
import {
  campaignChannelLabels,
  campaignGoalLabels,
  campaignStatusColors,
  campaignStatusLabels,
} from '../campaign-labels';
import { CampaignChannelCards } from './campaign-channel-cards';
import { CampaignGoalCards } from './campaign-goal-cards';
import { CampaignPageHeader } from './campaign-page-header';
import { MessengerDraft } from './messenger-draft';
import { SmsDraft } from './sms-draft';
import { formatDateTime } from '@/lib/format-date';
import { useSessionContext } from '@/lib/session-context';

const detailsSchema = campaignDetailsSchema;
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
      {editable ? (
        <DraftEditor key={contextTag} campaign={campaign} />
      ) : (
        <>
          <CampaignPageHeader title={campaign.name} subtitle="Campaign summary" />
          <CampaignSummary campaign={campaign} />
        </>
      )}
    </main>
  );
}

function DraftEditor({ campaign }: { campaign: CampaignResponse }) {
  const pages = useMessengerPages();
  if (campaign.channel === 'sms') return <SmsDraft campaign={campaign} />;
  if (pages.isPending) return <p role="status">Loading…</p>;
  if (pages.isError) return <p role="alert">Your Facebook Pages could not load. Try again soon.</p>;
  return <MessengerDraft pages={pages.data} campaign={campaign} />;
}

const newCampaignSubtitle = 'Nothing is sent until you approve.';

function NewCampaignBuilder() {
  const [step, setStep] = useState<'start' | 'details' | 'messenger' | 'channels'>('start');
  const pages = useMessengerPages().data ?? [];
  return (
    <main className="space-y-6 p-6 md:p-8">
      {step === 'details' && <CampaignDetailsForm onBack={() => setStep('channels')} />}
      {step === 'messenger' && <MessengerDraft pages={pages} onBack={() => setStep('channels')} />}
      {step !== 'details' && step !== 'messenger' && (
        <>
          <CampaignPageHeader title="New campaign" subtitle={newCampaignSubtitle} />
          <CampaignChannelCards
            focusSms={step === 'channels'}
            hasMessengerPage={pages.length > 0}
            onChooseSms={() => setStep('details')}
            onChooseMessenger={() => setStep('messenger')}
          />
        </>
      )}
    </main>
  );
}

function useCampaignDetailsForm() {
  const save = useSaveCampaign();
  const router = useRouter();
  const form = useForm<DetailsInput, unknown, Details>({
    resolver: zodResolver(detailsSchema, {
      error: (issue) =>
        issue.path?.[0] === 'name' && issue.code === 'too_small'
          ? 'Enter a campaign name.'
          : undefined,
    }),
    defaultValues: { name: '', goal: null },
  });
  const submit = form.handleSubmit((input) =>
    save.mutate(
      { input: { ...input, channel: 'sms' } },
      { onSuccess: (saved) => router.replace(`/campaigns/${saved.id}`) },
    ),
  );
  return { form, submit, save, opening: save.isSuccess };
}

function CampaignDetailsForm({ onBack }: { onBack: () => void }) {
  const formId = useId();
  const { form, submit, save, opening } = useCampaignDetailsForm();
  const busy = save.isPending || opening;
  return (
    <>
      <CampaignPageHeader
        title="New campaign"
        subtitle={newCampaignSubtitle}
        onBack={onBack}
        backDisabled={busy}
        action={
          <Button
            type="submit"
            form={formId}
            variant="secondary"
            loading={save.isPending}
            disabled={opening}
          >
            Save draft
          </Button>
        }
      />
      <FormProvider {...form}>
        <form
          id={formId}
          onSubmit={submit}
          className="max-w-xl space-y-4 rounded-lg border border-border bg-surface p-5"
        >
          <fieldset className="min-w-0 space-y-4" disabled={busy}>
            <CampaignFields />
          </fieldset>
          {save.error && (
            <p role="alert" className="text-danger">
              {save.error.message}
            </p>
          )}
          {opening && <p role="status">Opening draft…</p>}
        </form>
      </FormProvider>
    </>
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
        {(control) => (
          <Input
            {...control}
            {...register('name', { setValueAs: (value: string) => value.trim() })}
            aria-required="true"
            autoFocus
          />
        )}
      </FormField>
      <CampaignGoalCards />
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
      {campaign.approval && (
        <p role="status">
          Checking who can get this message: {formatCount(campaign.approval.checked)} of up to{' '}
          {formatCount(campaign.approval.estimatedTotal)} people so far. Nothing is sent until the
          check finishes.
        </p>
      )}
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
