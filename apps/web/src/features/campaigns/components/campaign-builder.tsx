'use client';

import { MessageSquare } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import {
  campaignGoals,
  createCampaignSchema,
  type CampaignGoal,
  type CampaignResponse,
} from '@dakly/contracts/campaigns';
import { Badge } from '@dakly/ui/badge';
import { Button } from '@dakly/ui/button';
import { Input } from '@dakly/ui/input';

import { useSaveCampaign } from '../api/save-campaign';
import {
  campaignChannelLabels,
  campaignStatusColors,
  campaignStatusLabels,
} from '../campaign-labels';
import { formatDateTime } from '@/lib/format-date';
import { useSessionContext } from '@/lib/session-context';

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
      <div>
        <h1 className="text-xl font-bold break-words">{title}</h1>
        <p className="mt-1 text-text-muted">
          {editable ? 'Nothing is sent until you approve.' : 'Campaign summary'}
        </p>
      </div>
    </header>
  );
}

function CampaignDetailsForm({ campaign }: { campaign?: CampaignResponse }) {
  const save = useSaveCampaign();
  const router = useRouter();
  const [error, setError] = useState<string>();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const parsed = createCampaignSchema.safeParse({
      channel: 'sms',
      name: data.get('name'),
      goal: data.get('goal') || null,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the campaign details.');
      return;
    }
    setError(undefined);
    const { name, goal } = parsed.data;
    save.mutate(campaign ? { id: campaign.id, input: { name, goal } } : { input: parsed.data }, {
      onSuccess: (saved) => {
        if (!campaign) router.replace(`/campaigns/${saved.id}`);
      },
    });
  }
  return (
    <form
      onSubmit={submit}
      className="max-w-xl space-y-4 rounded-lg border border-border bg-surface p-5"
    >
      <CampaignFields campaign={campaign} />
      {(error || save.error) && (
        <p role="alert" className="text-danger">
          {error ?? save.error?.message}
        </p>
      )}
      {save.isSuccess && <p role="status">Draft saved.</p>}
      <Button type="submit" loading={save.isPending}>
        {campaign ? 'Save draft' : 'Create SMS draft'}
      </Button>
    </form>
  );
}

function CampaignFields({ campaign }: { campaign?: CampaignResponse }) {
  return (
    <>
      <div className="space-y-2">
        <span className="inline-flex size-10 items-center justify-center rounded-md bg-primary-soft text-action">
          <MessageSquare aria-hidden="true" size={20} strokeWidth={1.75} />
        </span>
        <h2 className="text-md font-semibold">SMS</h2>
        <p className="text-text-muted">Send a short text to customers who agreed to receive SMS.</p>
      </div>
      <label className="grid gap-1">
        Campaign name
        <Input name="name" defaultValue={campaign?.name} required maxLength={100} />
      </label>
      <label className="grid gap-1">
        Goal
        <select
          name="goal"
          defaultValue={campaign?.goal ?? ''}
          className="min-h-10 rounded-md border border-input-border bg-surface px-3 text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <option value="">Choose a goal</option>
          {campaignGoals.map((goal) => (
            <option key={goal} value={goal}>
              {goals[goal]}
            </option>
          ))}
        </select>
      </label>
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
