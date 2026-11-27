import type { ContactDetailResponse } from '@dakly/contracts/contacts';
import type { CustomerSummaryResponse } from '@dakly/contracts/customer-profile';
import { Badge } from '@dakly/ui/badge';
import { Skeleton } from '@dakly/ui/skeleton';

import { channelLabels, customerPhone, profileSourceLabels } from '../customer-labels';
import { DeleteCustomerAction } from './customer-actions';
import { formatDateWithYear } from '@/lib/format-date';

type ProfileOverviewProps = {
  summary: CustomerSummaryResponse;
  detail: ContactDetailResponse | undefined;
  canEdit: boolean;
};

export function ProfileOverview({ summary, detail, canEdit }: ProfileOverviewProps) {
  const fields = [
    { label: 'Phone', value: customerPhone(summary), mono: true },
    { label: 'Email', value: summary.email },
    { label: 'Address', value: [summary.address, summary.district].filter(Boolean).join(', ') },
    { label: 'Customer source', value: profileSourceLabels[summary.source] },
    { label: 'Favourite category', value: summary.favouriteCategory },
    { label: 'Customer since', value: formatDateWithYear(summary.createdAt) },
  ];
  return (
    <div className="space-y-5">
      <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
        {fields.map(({ label, value, mono }) => (
          <div key={label} className="min-w-0">
            <dt className="text-sm text-text-muted">{label}</dt>
            <dd className={`text-base font-semibold break-words ${mono ? 'tabular-nums' : ''}`}>
              {value || <span className="font-normal text-text-subtle">Not added</span>}
            </dd>
          </div>
        ))}
      </dl>
      <div className="space-y-2 border-t border-border pt-4">
        <p className="text-sm text-text-muted">Segments and tags</p>
        {summary.tags.length ? (
          <div className="flex flex-wrap gap-1.5">
            {summary.tags.map((tag) => (
              <Badge key={tag} variant="info">
                {tag}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-sm text-text-muted">No tags added yet</p>
        )}
      </div>
      <ChatChannels detail={detail} />
      {canEdit && detail ? <DeleteCustomerAction customer={detail} /> : null}
    </div>
  );
}

function ChatChannels({ detail }: { detail: ContactDetailResponse | undefined }) {
  return (
    <div className="space-y-2 border-t border-border pt-4">
      <p className="text-sm text-text-muted">Chat channels</p>
      {!detail ? <Skeleton className="h-5 w-48" /> : null}
      {detail?.identities.length ? (
        <ul className="space-y-1">
          {detail.identities.map((identity) => (
            <li key={identity.id} className="text-sm">
              {channelLabels[identity.channel]}: {identity.profileName ?? 'No profile name'}
            </li>
          ))}
        </ul>
      ) : null}
      {detail && !detail.identities.length ? (
        <p className="text-sm text-text-muted">
          No chat channels yet. They appear when this customer messages the shop.
        </p>
      ) : null}
    </div>
  );
}
