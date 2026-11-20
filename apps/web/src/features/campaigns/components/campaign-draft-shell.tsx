'use client';

import Link from 'next/link';
import type { FormEventHandler, ReactNode } from 'react';

import type { CampaignChannel } from '@dakly/contracts/campaigns';
import { Button } from '@dakly/ui/button';

import { campaignChannelLabels } from '../campaign-labels';
import { CampaignPageHeader } from './campaign-page-header';
import { CampaignStepper, useCampaignStep } from './campaign-steps';

// The frame every saved draft shares: header, step bar, form card with Back and Continue, and the
// preview column. Each channel supplies the fields and what the side column shows.
type Step = ReturnType<typeof useCampaignStep>['step'];

type ShellProps = {
  title: string;
  channel: CampaignChannel;
  formId: string;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onSaveDraft: () => void;
  saving: boolean;
  canSave: boolean;
  busy: boolean;
  error?: string;
  message?: string;
  fields: (step: Step) => ReactNode;
  side: (step: Step) => ReactNode;
};

export function CampaignDraftShell({
  title,
  channel,
  formId,
  onSubmit,
  onSaveDraft,
  saving,
  canSave,
  busy,
  error,
  message,
  fields,
  side,
}: ShellProps) {
  const { step, previous, next, hrefFor } = useCampaignStep();
  const sideColumn = side(step);
  return (
    <div className="space-y-6">
      <CampaignPageHeader
        title={title}
        subtitle={`${campaignChannelLabels[channel]} campaign · nothing is sent until you approve`}
        action={
          <Button variant="secondary" loading={saving} disabled={!canSave} onClick={onSaveDraft}>
            Save draft
          </Button>
        }
      />
      <CampaignStepper current={step} hrefFor={hrefFor} />
      <div
        className={
          sideColumn ? 'grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]' : undefined
        }
      >
        <form
          id={formId}
          onSubmit={onSubmit}
          className="min-w-0 space-y-4 rounded-lg border border-border bg-surface p-5"
        >
          <fieldset className="min-w-0 space-y-4" disabled={busy}>
            {fields(step)}
          </fieldset>
          {error && (
            <p role="alert" className="text-danger">
              {error}
            </p>
          )}
          {message && <p role="status">{message}</p>}
          <StepButtons
            previous={previous && hrefFor(previous)}
            hasNext={Boolean(next)}
            saving={saving}
          />
        </form>
        {sideColumn}
      </div>
    </div>
  );
}

function StepButtons({
  previous,
  hasNext,
  saving,
}: {
  previous?: string;
  hasNext: boolean;
  saving: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
      {previous ? (
        <Link
          href={previous}
          className="inline-flex min-h-10 items-center rounded-md border border-border-strong px-4 font-medium hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          Back
        </Link>
      ) : (
        <span />
      )}
      {hasNext && (
        <Button type="submit" loading={saving}>
          Continue
        </Button>
      )}
    </div>
  );
}
