'use client';
import { Clock, Inbox, Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { Button, buttonVariants } from '@dakly/ui/button';
import { EmptyState } from '@dakly/ui/empty-state';
import { QueryError } from '@dakly/ui/query-error';

import { useDrafts } from '../api/get-drafts';
import { usePosts } from '../api/get-posts';
import { useSocialAccounts, type SocialAccount } from '../api/get-social-accounts';
import { buildEntries, timeOnDay, type CalendarEntry } from '../post-calendar';
import { useMovePost } from '../use-move-post';
import { useMyPostsParams } from '../use-my-posts-params';
import { CalendarPanel } from './calendar-panel';
import { DraftsCard } from './drafts-card';
import { HubDialogs, type HubDialog } from './hub-dialogs';
import { HubNotice } from './hub-notice';
import { MyPostsTabs } from './my-posts-tabs';
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
  const drafts = useDrafts();
  const failed = accounts.error ?? posts.error ?? drafts.error;
  if (failed)
    return (
      <main className="p-4 md:p-8">
        <QueryError
          message={failed.message}
          onRetry={() => void Promise.all([accounts.refetch(), posts.refetch(), drafts.refetch()])}
          retryLabel="Retry my posts"
        />
      </main>
    );
  if (!accounts.data || !posts.data || !drafts.data) return <SocialHubLoading />;
  return <MyPosts accounts={accounts.data} posts={posts.data} drafts={drafts.data} />;
}

type MyPostsProps = {
  accounts: SocialAccount[];
  posts: NonNullable<ReturnType<typeof usePosts>['data']>;
  drafts: NonNullable<ReturnType<typeof useDrafts>['data']>;
};

function MyPosts({ accounts, posts, drafts }: MyPostsProps) {
  const { data: session } = useSessionContext();
  const url = useMyPostsParams(accounts);
  const [dialog, setDialog] = useState<HubDialog>(null);
  const [open, setOpen] = useState<CalendarEntry | null>(null);
  const store = session?.currentStore;
  const canEdit = Boolean(store?.canEditSocial);
  const all = buildEntries(posts, accounts, null);
  const { notice: moveNotice, move } = useMovePost();
  const [draftNotice, setDraftNotice] = useState<{ message: string; tone?: 'error' } | null>(null);
  const notice = url.tab === 'draft' ? draftNotice : moveNotice;
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
        drafts={drafts}
        onDraftNotice={(message, tone) => setDraftNotice({ message, tone })}
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
            <Link href="/social/posts/new" data-shortcut="new" className={buttonVariants()}>
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
    <section className="rounded-lg border border-border bg-surface">
      <EmptyState
        icon={Inbox}
        title="Connect your channel"
        description="Once you connect your channels, your posts will show here."
        action={
          <Link href="/social" className={buttonVariants()}>
            <Plus aria-hidden="true" size={16} strokeWidth={1.75} /> Connect with channel
          </Link>
        }
      />
    </section>
  );
}

type BodyProps = MyPostsProps & {
  onDraftNotice: (message: string, tone?: 'error') => void;
  url: ReturnType<typeof useMyPostsParams>;
  canEdit: boolean;
  onOpen: (entry: CalendarEntry) => void;
  onMove?: (entry: CalendarEntry, day: string) => void;
};

function MyPostsBody({
  accounts,
  posts,
  drafts,
  onDraftNotice,
  url,
  canEdit,
  onOpen,
  onMove,
}: BodyProps) {
  if (accounts.length === 0) return <ConnectFirst />;
  const all = buildEntries(posts, accounts, null);
  const shown = buildEntries(posts, accounts, url.accountId);
  const published = all.filter(({ status }) => status === 'published').length;
  const counts = {
    calendar: all.length - published,
    published,
    draft: drafts.length,
  };
  return (
    <>
      <MyPostsTabs
        tab={url.tab}
        counts={counts}
        onTab={(tab) => url.setParams({ tab: tab === 'calendar' ? null : tab })}
      />
      {url.tab === 'published' && (
        <PublishedList
          accounts={accounts}
          accountId={url.accountId}
          onAccount={(account) => url.setParams({ account })}
          entries={shown.filter(({ status }) => status === 'published')}
          sort={url.sort}
          onSort={(sort) => url.setParams({ sort: sort === 'newest' ? null : sort })}
          onOpen={onOpen}
        />
      )}
      {url.tab === 'draft' && (
        <DraftsCard
          bare
          drafts={drafts}
          accounts={accounts}
          canEdit={canEdit}
          onNotice={onDraftNotice}
        />
      )}
      {url.tab === 'calendar' && (
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
