'use client';

import { useId } from 'react';
import { FormProvider, useFormContext, useWatch } from 'react-hook-form';

import type { CampaignResponse } from '@dakly/contracts/campaigns';
import { countSmsParts } from '@dakly/contracts/sms';
import { FormField } from '@dakly/ui/form-field';
import { Input } from '@dakly/ui/input';
import { Textarea } from '@dakly/ui/textarea';

import { CampaignApproveDialog } from './campaign-approve-dialog';
import { CampaignAudienceFields } from './campaign-audience-fields';
import { CampaignDraftShell } from './campaign-draft-shell';
import { CampaignEstimate } from './campaign-estimate';
import { CampaignGoalCards } from './campaign-goal-cards';
import { isScheduleBlocked } from './campaign-schedule';
import { CampaignScheduleFields } from './campaign-schedule-fields';
import { useAfterSave, type CampaignStepId } from './campaign-steps';
import { useSmsDraftForm, type SmsDraftInput } from './use-sms-draft-form';

export function SmsDraft({ campaign }: { campaign: CampaignResponse }) {
  const formId = useId();
  const { afterSave, approving, closeApproval } = useAfterSave();
  const { form, submit, saveDraft, save, isDirty } = useSmsDraftForm(campaign, afterSave);
  const schedule = useWatch({ control: form.control, name: 'schedule' });
  const scheduleBlocked = isScheduleBlocked(schedule, 'sms');
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
        finishBlocked={scheduleBlocked}
        busy={save.isPending}
        error={save.error?.message}
        message={save.isSuccess && !isDirty ? 'Draft saved.' : undefined}
        fields={(step) => <SmsFields step={step} failureCode={campaign.approvalFailureCode} />}
        side={(step) => (
          <>
            {(step === 'content' || step === 'schedule') && <SmsPreview />}
            {(step === 'audience' || step === 'schedule') && (
              <CampaignEstimate
                channel="sms"
                campaignId={campaign.id}
                savedAt={campaign.updatedAt}
              />
            )}
          </>
        )}
      />
      {approving && <CampaignApproveDialog campaign={campaign} onClose={closeApproval} />}
    </FormProvider>
  );
}

function SmsFields({
  step,
  failureCode,
}: {
  step: CampaignStepId;
  failureCode: CampaignResponse['approvalFailureCode'];
}) {
  if (step === 'goal') return <SmsGoalFields />;
  if (step === 'content') return <SmsContentFields />;
  if (step === 'audience') return <CampaignAudienceFields />;
  return <CampaignScheduleFields channel="sms" failureCode={failureCode} />;
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
  const partCount = countSmsParts(text);
  return (
    <FormField
      name="content.text"
      label="Message"
      hint={`${text.length} of 1000 characters · ${partCount === 1 ? '1 SMS part' : `${partCount} SMS parts`}. Dakly adds the opt-out link.`}
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
