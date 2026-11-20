'use client';

import { useId } from 'react';
import { FormProvider, useFormContext, useWatch } from 'react-hook-form';

import type { CampaignResponse } from '@dakly/contracts/campaigns';
import { countSmsParts } from '@dakly/contracts/sms';
import { FormField } from '@dakly/ui/form-field';
import { Input } from '@dakly/ui/input';
import { Textarea } from '@dakly/ui/textarea';

import { CampaignAudienceFields } from './campaign-audience-fields';
import { CampaignDraftShell } from './campaign-draft-shell';
import { CampaignEstimate } from './campaign-estimate';
import { CampaignGoalCards } from './campaign-goal-cards';
import { useCampaignStep, type CampaignStepId } from './campaign-steps';
import { useSmsDraftForm, type SmsDraftInput } from './use-sms-draft-form';

export function SmsDraft({ campaign }: { campaign: CampaignResponse }) {
  const formId = useId();
  const { goTo, next } = useCampaignStep();
  const { form, submit, saveDraft, save, isDirty } = useSmsDraftForm(
    campaign,
    () => next && goTo(next),
  );
  return (
    <FormProvider {...form}>
      <CampaignDraftShell
        title={campaign.name}
        channel="sms"
        formId={formId}
        onSubmit={submit}
        onSaveDraft={saveDraft}
        saving={save.isPending}
        canSave={isDirty}
        busy={save.isPending}
        error={save.error?.message}
        message={save.isSuccess && !isDirty ? 'Draft saved.' : undefined}
        fields={(step) => <SmsFields step={step} />}
        side={(step) => (
          <>
            {step === 'content' && <SmsPreview />}
            {step === 'audience' && (
              <CampaignEstimate
                channel="sms"
                campaignId={campaign.id}
                savedAt={campaign.updatedAt}
              />
            )}
          </>
        )}
      />
    </FormProvider>
  );
}

function SmsFields({ step }: { step: CampaignStepId }) {
  if (step === 'goal') return <SmsGoalFields />;
  return step === 'content' ? <SmsContentFields /> : <CampaignAudienceFields />;
}

function SmsGoalFields() {
  const { register } = useFormContext<SmsDraftInput>();
  return (
    <>
      <FormField name="name" label="Campaign name">
        {(control) => (
          <Input
            {...control}
            {...register('name', { setValueAs: (value: string) => value.trim() })}
            aria-required="true"
          />
        )}
      </FormField>
      <CampaignGoalCards />
    </>
  );
}

function SmsContentFields() {
  const { register, control } = useFormContext<SmsDraftInput>();
  const text = useWatch({ control, name: 'content.text' });
  return (
    <FormField
      name="content.text"
      label="Message"
      hint={`${text.length} of 1000 characters · ${countSmsParts(text)} SMS parts. Dakly adds the opt-out link.`}
    >
      {(field) => (
        <Textarea
          {...field}
          {...register('content.text', { setValueAs: (value: string) => value.trim() })}
          rows={6}
        />
      )}
    </FormField>
  );
}

function SmsPreview() {
  const { control } = useFormContext<SmsDraftInput>();
  const text = useWatch({ control, name: 'content.text' });
  return (
    <aside
      aria-label="Message preview"
      className="min-w-0 space-y-2 rounded-lg border border-border bg-surface-muted p-4"
    >
      <p className="text-sm font-semibold">What customers will see</p>
      <p className="rounded-lg border border-border bg-surface p-3 text-sm wrap-anywhere whitespace-pre-wrap">
        {text || <span className="text-text-muted">Your message appears here.</span>}
      </p>
    </aside>
  );
}
