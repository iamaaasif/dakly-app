import type { ConsentStatus } from '@dakly/contracts/contacts';
import type {
  CustomerSummaryResponse,
  MarketingPreferenceResponse,
} from '@dakly/contracts/customer-profile';
import { Switch } from '@dakly/ui/switch';
import { useToast } from '@dakly/ui/toast';

import { useMarketingPreferences, useSwitchMarketing } from '../api/customer-profile';
import { channelLabels } from '../customer-labels';
import { ConsentForm } from './consent-form';
import { PartError, RowsSkeleton } from './profile-parts';

const statusLabels: Record<ConsentStatus, string> = {
  granted: 'Subscribed',
  withdrawn: 'Unsubscribed',
  not_answered: 'Not asked yet',
};

function reachedAt(
  channel: MarketingPreferenceResponse['channel'],
  summary: CustomerSummaryResponse,
) {
  if (channel === 'email') return summary.email;
  return channel === 'whatsapp' ? (summary.whatsappPhone ?? summary.phone) : summary.phone;
}

type ProfileMarketingProps = {
  contactId: string;
  summary: CustomerSummaryResponse;
  canEdit: boolean;
};

export function ProfileMarketing({ contactId, summary, canEdit }: ProfileMarketingProps) {
  const preferences = useMarketingPreferences(contactId);
  if (preferences.error)
    return <PartError error={preferences.error} onRetry={() => void preferences.refetch()} />;
  if (preferences.isPending) return <RowsSkeleton label="Loading preferences" />;
  return (
    <div>
      <ul>
        {preferences.data.map((row) => (
          <li
            key={row.channel}
            className="flex items-center justify-between gap-4 border-b border-border py-3 last:border-b-0"
          >
            <PreferenceRow row={row} summary={summary} canEdit={canEdit} contactId={contactId} />
          </li>
        ))}
      </ul>
      <p className="pt-3 text-xs text-text-muted">
        Change consent only when the customer asks. Every change is logged with your name and time.
      </p>
      {canEdit ? (
        <details className="pt-3">
          <summary className="cursor-pointer text-sm font-medium text-action hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
            Record how the customer answered
          </summary>
          <div className="pt-3">
            <ConsentForm contactId={contactId} />
          </div>
        </details>
      ) : null}
    </div>
  );
}

type PreferenceRowProps = {
  row: MarketingPreferenceResponse;
  summary: CustomerSummaryResponse;
  canEdit: boolean;
  contactId: string;
};

function PreferenceRow({ row, summary, canEdit, contactId }: PreferenceRowProps) {
  const change = useSwitchMarketing(contactId);
  const showToast = useToast();
  const where = reachedAt(row.channel, summary);
  const labelId = `marketing-${row.channel}`;
  return (
    <>
      <div className="min-w-0">
        <p id={labelId} className="text-base font-semibold">
          {channelLabels[row.channel]}
        </p>
        <p className="text-sm break-words text-text-secondary tabular-nums">
          {[statusLabels[row.status], where].filter(Boolean).join(' · ')}
        </p>
        {row.channel === 'email' ? (
          <p className="text-xs text-text-muted">Email campaigns are not available yet.</p>
        ) : null}
      </div>
      <Switch
        aria-labelledby={labelId}
        checked={row.status === 'granted'}
        disabled={!canEdit || !row.canSwitch}
        onCheckedChange={(subscribed) => {
          if (row.channel === 'email') return;
          change.mutate(
            { channel: row.channel, subscribed },
            {
              onSuccess: () =>
                showToast(
                  `${channelLabels[row.channel]} ${subscribed ? 'subscribed' : 'unsubscribed'}`,
                ),
              onError: (error) => showToast(error.message),
            },
          );
        }}
      />
    </>
  );
}
