'use client';

import { useId } from 'react';
import { FormProvider, useFormContext, useWatch } from 'react-hook-form';

import type { CampaignResponse } from '@dakly/contracts/campaigns';
import type { ChannelConnection } from '@dakly/contracts/channels';
import { Button } from '@dakly/ui/button';

import { CampaignPageHeader } from './campaign-page-header';
import { MessengerContentFields } from './messenger-content-fields';
import { MessengerDetailsFields } from './messenger-details-fields';
import { MessengerEstimate } from './messenger-estimate';
import { MessengerPreview } from './messenger-preview';
import { useMessengerDraftForm, type DraftInput } from './use-messenger-draft-form';

export function MessengerDraft({
  pages,
  campaign,
  onBack,
}: {
  pages: ChannelConnection[];
  campaign?: CampaignResponse;
  onBack?: () => void;
}) {
  const formId = useId();
  const { form, submit, save, isDirty, opening } = useMessengerDraftForm(pages, campaign);
  const busy = save.isPending || opening;
  const saved = Boolean(campaign) && save.isSuccess && !isDirty;
  const saveButton = (
    <SaveButton
      formId={formId}
      isNew={!campaign}
      loading={save.isPending}
      disabled={opening || Boolean(campaign && !isDirty)}
    />
  );
  const formElement = (
    <form
      id={formId}
      onSubmit={submit}
      className="max-w-xl min-w-0 space-y-4 rounded-lg border border-border bg-surface p-5"
    >
      <fieldset className="min-w-0 space-y-4" disabled={busy}>
        <MessengerDetailsFields pages={pages} focusName={!campaign} />
        {campaign && <MessengerContentFields />}
      </fieldset>
      <DraftStatus error={save.error?.message} message={status(opening, saved)} />
      {campaign && saveButton}
    </form>
  );
  return (
    <FormProvider {...form}>
      {campaign ? (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          {formElement}
          <Side pages={pages} campaign={campaign} />
        </div>
      ) : (
        <>
          <CampaignPageHeader
            title="New campaign"
            subtitle="Nothing is sent until you approve."
            onBack={onBack}
            backDisabled={busy}
            action={saveButton}
          />
          {formElement}
        </>
      )}
    </FormProvider>
  );
}

function SaveButton({
  formId,
  isNew,
  loading,
  disabled,
}: {
  formId: string;
  isNew: boolean;
  loading: boolean;
  disabled: boolean;
}) {
  return (
    <Button
      type="submit"
      form={formId}
      variant={isNew ? 'secondary' : 'primary'}
      loading={loading}
      disabled={disabled}
    >
      Save draft
    </Button>
  );
}

function status(opening: boolean, saved: boolean) {
  if (opening) return 'Opening draft…';
  return saved ? 'Draft saved.' : undefined;
}

function DraftStatus({ error, message }: { error?: string; message?: string }) {
  return (
    <>
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
    </>
  );
}

function Side({ pages, campaign }: { pages: ChannelConnection[]; campaign: CampaignResponse }) {
  const { control } = useFormContext<DraftInput>();
  const content = useWatch({ control, name: 'content' });
  const connectionId = useWatch({ control, name: 'channelConnectionId' });
  const pageName = pages.find(({ id }) => id === connectionId)?.displayName ?? 'Your Page';
  return (
    <aside className="min-w-0 space-y-4">
      <MessengerPreview
        pageName={pageName}
        content={{
          text: content.text,
          imageUrl: content.imageUrl?.startsWith('https://') ? content.imageUrl : null,
          buttons: content.buttons,
        }}
      />
      <MessengerEstimate campaignId={campaign.id} savedAt={campaign.updatedAt} />
    </aside>
  );
}
