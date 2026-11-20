'use client';
import { Calendar, CircleCheck, Clock, Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { Button, buttonVariants } from '@dakly/ui/button';
import { cn } from '@dakly/ui/cn';
import { QueryError } from '@dakly/ui/query-error';

import { usePosts } from '../api/get-posts';
import { useSocialAccounts, type SocialAccount } from '../api/get-social-accounts';
import { buildEntries, timeOnDay, type CalendarEntry } from '../post-calendar';
import { useMovePost } from '../use-move-post';
import { useMyPostsParams } from '../use-my-posts-params';
import { CalendarPanel } from './calendar-panel';
import { HubDialogs, type HubDialog } from './hub-dialogs';
import { HubNotice } from './hub-notice';
import { PostDetailsDialog } from './post-details-dialog';
import { PublishedList } from './published-list';
import { ReconnectBanner } from './reconnect-banner';
import { SocialHubLoading } from './social-hub-loading';
import { useSessionContext } from '@/lib/session-context';

// My posts has no notice area; the hub shows dialog outcomes.
const ignoreNotice = () => undefined;

export function MyPostsScreen() {
  const accounts = useSocialAccounts();
  const posts = usePosts();
  const failed = accounts.error ?? posts.error;
  if (failed)
    return (
      <main className="p-4 md:p-8">
        <QueryError
          message={failed.message}
          onRetry={() => void Promise.all([accounts.refetch(), posts.refetch()])}
          retryLabel="Retry my posts"
        />
      </main>
    );
  if (!accounts.data || !posts.data) return <SocialHubLoading />;
  return <MyPosts accounts={accounts.data} posts={posts.data} />;
}

type MyPostsProps = {
  accounts: SocialAccount[];
  posts: NonNullable<ReturnType<typeof usePosts>['data']>;
};

function MyPosts({ accounts, posts }: MyPostsProps) {
  const { data: session } = useSessionContext();
  const url = useMyPostsParams(accounts);
  const [dialog, setDialog] = useState<HubDialog>(null);
  const [open, setOpen] = useState<CalendarEntry | null>(null);
  const store = session?.currentStore;
  const canEdit = Boolean(store?.canEditSocial);
  const all = buildEntries(posts, accounts, null);
  const { notice, move } = useMovePost();
  return (
    <main className="space-y-6 p-4 md:p-8">
      <MyPostsHeader
        hasAccounts={accounts.length > 0}
        canEdit={canEdit}
        onSchedule={() => setDialog({ type: 'schedule' })}
      />
      <ReconnectBanners
        accounts={accounts}
        entries={all}
        canReconnect={Boolean(store?.canEditStoreSettings)}
        onReconnect={(account) =>
          setDialog({ type: 'connect', kind: account.kind, reconnecting: account })
        }
      />
      {notice && <HubNotice message={notice.message} tone={notice.tone} />}
      <MyPostsBody
        accounts={accounts}
        posts={posts}
        url={url}
        canEdit={canEdit}
        onOpen={setOpen}
        onMove={canEdit ? (entry, day) => move(entry, timeOnDay(entry, day)) : undefined}
      />
      {open && (
        <PostDetailsDialog
          entry={open}
          accounts={accounts}
          onMove={canEdit ? move : undefined}
          onClose={() => setOpen(null)}
        />
      )}
      <HubDialogs
        dialog={dialog}
        accounts={accounts}
        onChange={setDialog}
        onNotice={ignoreNotice}
      />
    </main>
  );
}

type PostTabsProps = {
  tab: 'calendar' | 'published';
  entries: CalendarEntry[];
  onTab: (tab: 'calendar' | 'published') => void;
};

function PostTabs({ tab, entries, onTab }: PostTabsProps) {
  const published = entries.filter(({ status }) => status === 'published').length;
  const tabs = [
    { value: 'calendar', label: 'Calendar', icon: Calendar, count: entries.length - published },
    { value: 'published', label: 'Published', icon: CircleCheck, count: published },
  ] as const;
  return (
    <div role="tablist" aria-label="My posts" className="flex gap-1 border-b border-border">
      {tabs.map(({ value, label, icon: Icon, count }) => (
        <button
          key={value}
          type="button"
          role="tab"
          aria-selected={tab === value}
          onClick={() => onTab(value)}
          className={cn(
            '-mb-px flex min-h-10 items-center gap-2 border-b-2 px-3 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
            tab === value
              ? 'border-action font-medium text-text'
              : 'border-transparent text-text-muted hover:text-text',
          )}
        >
          <Icon aria-hidden="true" size={16} strokeWidth={1.75} />
          {label}
          <span className="rounded-full bg-surface-muted px-2 text-xs">{count}</span>
        </button>
      ))}
    </div>
  );
}

type HeaderProps = { hasAccounts: boolean; canEdit: boolean; onSchedule: () => void };

function MyPostsHeader({ hasAccounts, canEdit, onSchedule }: HeaderProps) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-bold md:text-2xl">My posts</h1>
        <p className="mt-1 text-text-muted">
          Plan upcoming posts on the calendar and see how published posts did, all in one place.
        </p>
      </div>
      {hasAccounts && (
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={onSchedule}>
            <Clock aria-hidden="true" size={16} strokeWidth={1.75} /> Posting schedule
          </Button>
          {canEdit && (
            <Link href="/social/posts/new" className={buttonVariants()}>
              <Plus aria-hidden="true" size={16} strokeWidth={1.75} /> Create post
            </Link>
          )}
        </div>
      )}
    </header>
  );
}

type BannersProps = {
  accounts: SocialAccount[];
  entries: CalendarEntry[];
  canReconnect: boolean;
  onReconnect: (account: SocialAccount) => void;
};

function ReconnectBanners({ accounts, entries, canReconnect, onReconnect }: BannersProps) {
  return accounts
    .filter(({ status }) => status === 'needs_reconnect')
    .map((account) => (
      <ReconnectBanner
        key={account.id}
        account={account}
        canReconnect={canReconnect}
        scheduledCount={
          entries.filter(
            ({ post, status }) =>
              status === 'needs_attention' &&
              post.targets.some(({ channelConnectionId }) => channelConnectionId === account.id),
          ).length
        }
        onReconnect={() => onReconnect(account)}
      />
    ));
}

function ConnectFirst() {
  return (
    <section className="rounded-lg border border-border bg-surface p-8 text-center">
      <h2 className="text-lg font-semibold">Connect your Facebook Page</h2>
      <p className="mt-1 text-text-muted">Connect an account to plan and publish posts.</p>
      <Link href="/social" className={cn(buttonVariants(), 'mt-4')}>
        Go to Social hub
      </Link>
    </section>
  );
}

type BodyProps = MyPostsProps & {
  url: ReturnType<typeof useMyPostsParams>;
  canEdit: boolean;
  onOpen: (entry: CalendarEntry) => void;
  onMove?: (entry: CalendarEntry, day: string) => void;
};

function MyPostsBody({ accounts, posts, url, canEdit, onOpen, onMove }: BodyProps) {
  if (accounts.length === 0) return <ConnectFirst />;
  const all = buildEntries(posts, accounts, null);
  const shown = buildEntries(posts, accounts, url.accountId);
  return (
    <>
      <PostTabs
        tab={url.tab}
        entries={all}
        onTab={(tab) => url.setParams({ tab: tab === 'calendar' ? null : tab })}
      />
      {url.tab === 'published' ? (
        <PublishedList
          entries={shown.filter(({ status }) => status === 'published')}
          sort={url.sort}
          onSort={(sort) => url.setParams({ sort: sort === 'newest' ? null : sort })}
          onOpen={onOpen}
        />
      ) : (
        <CalendarPanel
          {...url}
          accounts={accounts}
          entries={shown}
          hasPosts={all.length > 0}
          canEdit={canEdit}
          onOpen={onOpen}
          onMove={onMove}
        />
      )}
    </>
  );
}
