'use client';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

import type { CustomerSummaryResponse } from '@dakly/contracts/customer-profile';
import { formatMoney } from '@dakly/contracts/money';
import { ApiError } from '@dakly/ui/api-client';
import { Badge } from '@dakly/ui/badge';
import { buttonVariants } from '@dakly/ui/button';
import { Card } from '@dakly/ui/card';
import { QueryError } from '@dakly/ui/query-error';
import { Skeleton } from '@dakly/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@dakly/ui/tabs';

import { useCustomer } from '../api/customer';
import { useCustomerSummary } from '../api/customer-profile';
import {
  customerPhone,
  customerTypePill,
  parseProfileTab,
  profileTabs,
  type ProfileTab,
} from '../customer-labels';
import { EditCustomerAction } from './customer-actions';
import { PossibleSamePerson } from './possible-same-person';
import { ProfileActivity } from './profile-activity';
import { ProfileCampaigns } from './profile-campaigns';
import { ProfileMarketing } from './profile-marketing';
import { ProfileNotes } from './profile-notes';
import { ProfileOrders } from './profile-orders';
import { ProfileOverview } from './profile-overview';
import { RecentMerges } from './recent-merges';
import { formatDateWithYear, formatShortDate } from '@/lib/format-date';
import { initialsOf } from '@/lib/initials';
import { useSessionContext } from '@/lib/session-context';
import { changeUrl, useUrlQuery } from '@/lib/use-url-query';

type CustomerProfileProps = { contactId: string; tab?: ProfileTab };

export function CustomerProfile({ contactId, tab: initialTab = 'overview' }: CustomerProfileProps) {
  const tab = useUrlQuery(initialTab, (raw) => parseProfileTab(raw.tab));
  const summary = useCustomerSummary(contactId);
  const detail = useCustomer(contactId);
  const { data: context } = useSessionContext();
  const canEdit = Boolean(context?.currentStore?.canCreateCustomer);
  return (
    <main className="mx-auto max-w-[1400px] space-y-4 p-4 md:p-6">
      {summary.error ? (
        <SummaryError error={summary.error} onRetry={() => void summary.refetch()} />
      ) : null}
      {summary.isPending ? <ProfileSkeleton /> : null}
      {summary.data ? (
        <>
          <ProfileHeader summary={summary.data}>
            {canEdit && detail.data ? <EditCustomerAction customer={detail.data} /> : null}
          </ProfileHeader>
          <StatCards summary={summary.data} />
          <PossibleSamePerson contactId={contactId} canEdit={canEdit} />
          <RecentMerges contactId={contactId} canEdit={canEdit} />
          <ProfileTabs tab={tab} contactId={contactId} summary={summary.data}>
            <ProfileOverview summary={summary.data} detail={detail.data} canEdit={canEdit} />
          </ProfileTabs>
        </>
      ) : null}
    </main>
  );
}

function SummaryError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  if (error instanceof ApiError && error.code === 'CONTACT_NOT_FOUND')
    return <p>This customer was deleted or is not in this shop.</p>;
  return <QueryError message={error.message} onRetry={onRetry} retryLabel="Retry customer" />;
}

type ProfileTabsProps = {
  tab: ProfileTab;
  contactId: string;
  summary: CustomerSummaryResponse;
  children: React.ReactNode;
};

function ProfileTabs({ tab, contactId, summary, children }: ProfileTabsProps) {
  const { data: context } = useSessionContext();
  const canEdit = Boolean(context?.currentStore?.canCreateCustomer);
  const panel = 'p-4 md:p-6';
  return (
    <Card className="overflow-hidden p-0">
      <Tabs
        value={tab}
        onValueChange={(next) => changeUrl(next === 'overview' ? '?' : `?tab=${next}`, 'push')}
      >
        <TabsList aria-label="Customer sections" className="px-2">
          {profileTabs.map(({ value, label }) => (
            <TabsTrigger key={value} value={value}>
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="overview" className={panel}>
          {children}
        </TabsContent>
        <TabsContent value="orders" className={panel}>
          <ProfileOrders contactId={contactId} />
        </TabsContent>
        <TabsContent value="activity" className={panel}>
          <ProfileActivity contactId={contactId} />
        </TabsContent>
        <TabsContent value="campaigns" className={panel}>
          <ProfileCampaigns contactId={contactId} />
        </TabsContent>
        <TabsContent value="notes" className={panel}>
          <ProfileNotes contactId={contactId} canEdit={canEdit} />
        </TabsContent>
        <TabsContent value="marketing" className={panel}>
          <ProfileMarketing contactId={contactId} summary={summary} canEdit={canEdit} />
        </TabsContent>
      </Tabs>
    </Card>
  );
}

function ProfileHeader({
  summary,
  children,
}: {
  summary: CustomerSummaryResponse;
  children: React.ReactNode;
}) {
  const name = summary.name ?? 'No name';
  const line = [summary.phone ? customerPhone(summary) : null, summary.email, summary.district]
    .filter(Boolean)
    .join(' · ');
  return (
    <header className="flex flex-wrap items-center gap-x-3 gap-y-3">
      <Link
        href="/customers"
        aria-label="All customers"
        className="grid size-9 shrink-0 place-items-center rounded-md text-text-secondary transition-colors duration-150 hover:bg-neutral-soft hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none"
      >
        <ArrowLeft aria-hidden="true" size={18} />
      </Link>
      <div
        aria-hidden="true"
        className="grid size-11 shrink-0 place-items-center rounded-full bg-primary-soft text-base font-semibold text-action"
      >
        {initialsOf(name)}
      </div>
      <div className="min-w-0 flex-1 basis-48">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-bold break-words">{name}</h1>
          <TypePill summary={summary} />
        </div>
        {line ? <p className="text-sm break-words text-text-muted tabular-nums">{line}</p> : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {children}
        <Link href="/campaigns/new" className={buttonVariants()}>
          Create campaign
        </Link>
      </div>
    </header>
  );
}

function StatCards({ summary }: { summary: CustomerSummaryResponse }) {
  const stats = [
    { label: 'Total spending', value: formatMoney(summary.totalSpendPoisha) },
    { label: 'Orders', value: String(summary.ordersCount) },
    {
      label: 'Average order value',
      value: summary.averageOrderPoisha === null ? '—' : formatMoney(summary.averageOrderPoisha),
    },
    {
      label: 'Last purchase',
      value: summary.lastPurchaseAt ? formatShortDate(summary.lastPurchaseAt) : '—',
    },
    {
      label: 'First purchase',
      value: summary.firstPurchaseAt ? formatDateWithYear(summary.firstPurchaseAt) : '—',
    },
    {
      label: 'Lifetime value',
      value:
        summary.lifetimeValuePoisha === null || summary.ordersCount === 0
          ? 'Not enough data yet'
          : formatMoney(summary.lifetimeValuePoisha),
    },
  ];
  return (
    <dl className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
      {stats.map(({ label, value }) => (
        <Card key={label} className="space-y-1 p-3">
          <dt className="text-sm text-text-muted">{label}</dt>
          {/* A sentence in place of a number is set smaller so it stays on one line. */}
          <dd
            className={`font-bold tabular-nums ${/\d/.test(value) || value === '—' ? 'text-md' : 'text-base'}`}
          >
            {value}
          </dd>
        </Card>
      ))}
    </dl>
  );
}

function ProfileSkeleton() {
  return (
    <div role="status" className="space-y-4">
      <p className="sr-only">Loading customer</p>
      <div className="flex items-center gap-3">
        <Skeleton className="size-9" />
        <Skeleton className="size-11 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-[74px] rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-64 w-full rounded-lg" />
    </div>
  );
}

function TypePill({ summary }: { summary: CustomerSummaryResponse }) {
  const { label, variant } = customerTypePill({
    lifecycleStage: summary.lifecycleStage,
    isHighValue: false,
  });
  return (
    <Badge variant={variant} className="rounded-full px-2.5">
      {label}
    </Badge>
  );
}
