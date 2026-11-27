import { MessageSquare, ShoppingBag, ShieldCheck, StickyNote, Zap } from 'lucide-react';
import type { ComponentType } from 'react';

import type {
  CustomerActivityKind,
  CustomerActivityResponse,
} from '@dakly/contracts/customer-profile';

import { useCustomerActivity } from '../api/customer-profile';
import { channelLabels } from '../customer-labels';
import { LoadMore, PartEmpty, PartError, RowsSkeleton } from './profile-parts';
import { formatDateSmart } from '@/lib/format-date';

const looks: Record<CustomerActivityKind, { icon: ComponentType<{ size: number }>; tint: string }> =
  {
    order_placed: { icon: ShoppingBag, tint: 'bg-primary-soft text-action' },
    order_delivered: { icon: ShoppingBag, tint: 'bg-success-soft text-success' },
    order_returned: { icon: ShoppingBag, tint: 'bg-danger-soft text-danger' },
    order_cancelled: { icon: ShoppingBag, tint: 'bg-danger-soft text-danger' },
    campaign_sent: { icon: MessageSquare, tint: 'bg-warning-soft text-warning' },
    campaign_read: { icon: MessageSquare, tint: 'bg-warning-soft text-warning' },
    campaign_tapped: { icon: MessageSquare, tint: 'bg-warning-soft text-warning' },
    automation_entered: { icon: Zap, tint: 'bg-ai-soft text-ai' },
    consent_changed: { icon: ShieldCheck, tint: 'bg-neutral-soft text-text-secondary' },
    note_added: { icon: StickyNote, tint: 'bg-info-soft text-info' },
  };

type Facts = { subject: string; channel: string; granted: boolean };
const sentences: Record<CustomerActivityKind, (facts: Facts) => string> = {
  order_placed: ({ subject }) => `Placed order #${subject}`,
  order_delivered: ({ subject }) => `Order #${subject} was delivered`,
  order_returned: ({ subject }) => `Order #${subject} came back`,
  order_cancelled: ({ subject }) => `Order #${subject} was cancelled`,
  campaign_sent: ({ subject, channel }) => `Sent “${subject}” on ${channel}`,
  campaign_read: ({ subject, channel }) => `Read “${subject}” on ${channel}`,
  campaign_tapped: ({ subject }) => `Tapped a link in “${subject}”`,
  automation_entered: ({ subject }) => `Entered the “${subject}” automation`,
  consent_changed: ({ channel, granted }) =>
    granted
      ? `Agreed to marketing messages on ${channel}`
      : `Stopped marketing messages on ${channel}`,
  note_added: () => 'A note was added',
};

function activitySentence(item: CustomerActivityResponse): string {
  return sentences[item.kind]({
    subject: item.subject ?? '',
    channel: item.channel ? channelLabels[item.channel] : 'a channel',
    granted: item.consentStatus === 'granted',
  });
}

export function ProfileActivity({ contactId }: { contactId: string }) {
  const activity = useCustomerActivity(contactId);
  if (activity.error)
    return <PartError error={activity.error} onRetry={() => void activity.refetch()} />;
  if (activity.isPending) return <RowsSkeleton label="Loading activity" rows={4} />;
  const rows = activity.data.pages.flatMap((page) => page.items);
  if (!rows.length) return <PartEmpty>Nothing has happened with this customer yet.</PartEmpty>;
  return (
    <>
      <ol>
        {rows.map((item, index) => {
          const { icon: Icon, tint } = looks[item.kind];
          return (
            <li key={item.id} className="relative flex gap-3 pb-5 last:pb-0">
              {index < rows.length - 1 ? (
                <span
                  aria-hidden="true"
                  className="absolute top-8 bottom-0 left-4 w-px -translate-x-1/2 bg-border"
                />
              ) : null}
              <span
                aria-hidden="true"
                className={`relative grid size-8 shrink-0 place-items-center rounded-full ${tint}`}
              >
                <Icon size={15} />
              </span>
              <div className="min-w-0 pt-0.5">
                <p className="text-base break-words">{activitySentence(item)}</p>
                <p className="text-xs text-text-muted tabular-nums">{formatDateSmart(item.at)}</p>
              </div>
            </li>
          );
        })}
      </ol>
      <LoadMore
        hasNext={activity.hasNextPage}
        loading={activity.isFetchingNextPage}
        onMore={() => void activity.fetchNextPage()}
      />
    </>
  );
}
