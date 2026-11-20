'use client';

import { useId } from 'react';
import { FormProvider, useFormContext, useWatch } from 'react-hook-form';

import type { CampaignResponse } from '@dakly/contracts/campaigns';
import type { ChannelConnection } from '@dakly/contracts/channels';
import { Button } from '@dakly/ui/button';

import { CampaignDraftShell } from './campaign-draft-shell';
import { CampaignPageHeader } from './campaign-page-header';
import { useCampaignStep } from './campaign-steps';
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
  const { goTo, next } = useCampaignStep();
  const draft = useMessengerDraftForm(pages, campaign, () => next && goTo(next));
  return (
    <FormProvider {...draft.form}>
      {campaign ? (
        <SavedDraft pages={pages} campaign={campaign} draft={draft} />
      ) : (
        <NewDraft pages={pages} draft={draft} onBack={onBack} />
      )}
    </FormProvider>
  );
}

type Draft = ReturnType<typeof useMessengerDraftForm>;

function SavedDraft({
  pages,
  campaign,
  draft,
}: {
  pages: ChannelConnection[];
  campaign: CampaignResponse;
  draft: Draft;
}) {
  const { submit, saveDraft, save, isDirty, opening } = draft;
  return (
    <CampaignDraftShell
      title={campaign.name}
      channel="messenger"
      formId={useId()}
      onSubmit={submit}
      onSaveDraft={saveDraft}
      saving={save.isPending}
      canSave={isDirty}
      busy={save.isPending || opening}
      error={save.error?.message}
      message={save.isSuccess && !isDirty ? 'Draft saved.' : undefined}
      fields={(step) =>
        step === 'goal' ? (
          <MessengerDetailsFields pages={pages} focusName={false} />
        ) : (
          <MessengerContentFields />
        )
      }
      side={(step) => step === 'content' && <Side pages={pages} campaign={campaign} />}
    />
  );
}

function NewDraft({
  pages,
  draft,
  onBack,
}: {
  pages: ChannelConnection[];
  draft: Draft;
  onBack?: () => void;
}) {
  const formId = useId();
  const { submit, save, opening } = draft;
  const busy = save.isPending || opening;
  return (
    <>
      <CampaignPageHeader
        title="New campaign"
        subtitle="Nothing is sent until you approve."
        onBack={onBack}
        backDisabled={busy}
        action={<SaveButton formId={formId} loading={save.isPending} disabled={opening} />}
      />
      <form
        id={formId}
        onSubmit={submit}
        className="max-w-xl min-w-0 space-y-4 rounded-lg border border-border bg-surface p-5"
      >
        <fieldset className="min-w-0 space-y-4" disabled={busy}>
          <MessengerDetailsFields pages={pages} focusName />
        </fieldset>
        <DraftStatus error={save.error?.message} message={opening ? 'Opening draft…' : undefined} />
      </form>
    </>
  );
}

function SaveButton({
  formId,
  loading,
  disabled,
}: {
  formId: string;
  loading: boolean;
  disabled: boolean;
}) {
  return (
    <Button type="submit" form={formId} variant="secondary" loading={loading} disabled={disabled}>
      Save draft
    </Button>
  );
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
