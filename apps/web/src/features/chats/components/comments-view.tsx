'use client';
import { ArrowLeft, Facebook, Instagram, MessageSquare } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@dakly/ui/button';
import { QueryError } from '@dakly/ui/query-error';
import { Skeleton } from '@dakly/ui/skeleton';

import { useComments } from '../api/comments';
import { chatsHref, type ChatScreenQuery } from '../chat-filters';
import { groupCommentsByPost, type CommentPost } from '../comment-posts';
import { CommentCard } from './comment-card';
import { formatRelativeTime } from '@/lib/format-date';
import { useSessionContext } from '@/lib/session-context';

const postIcons = { messenger: Facebook, instagram: Instagram } as const;
const postNames = { messenger: 'Facebook post', instagram: 'Instagram post' } as const;

export function CommentsView({ query }: { query: ChatScreenQuery }) {
  const comments = useComments();
  const posts = groupCommentsByPost(comments.data?.pages.flatMap((page) => page.items) ?? []);
  const open = posts.find((post) => post.externalPostId === query.post);
  return (
    <>
      <section
        aria-label="Posts with comments"
        className={`col-start-1 row-start-2 min-h-0 min-w-0 flex-col ${query.post ? 'hidden lg:flex' : 'flex'}`}
      >
        <div className="min-h-0 flex-1 overflow-y-auto">
          <PostRows query={query} posts={posts} comments={comments} />
        </div>
      </section>
      <section
        aria-label="Comments on the post"
        className={`col-start-1 row-start-2 min-h-0 min-w-0 flex-col border-border lg:col-start-2 lg:border-l ${query.post ? 'flex' : 'hidden lg:flex'}`}
      >
        {open ? (
          <PostThread query={query} post={open} />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-text-muted">
            <MessageSquare aria-hidden="true" size={28} strokeWidth={1.5} />
            <p>Choose a post to read its comments.</p>
            {query.post ? <BackToPosts query={query} /> : null}
          </div>
        )}
      </section>
    </>
  );
}

function PostRows({
  query,
  posts,
  comments,
}: {
  query: ChatScreenQuery;
  posts: CommentPost[];
  comments: ReturnType<typeof useComments>;
}) {
  if (comments.error)
    return (
      <div className="p-3">
        <QueryError
          message={comments.error.message}
          onRetry={() => void comments.refetch()}
          retryLabel="Retry comments"
        />
      </div>
    );
  if (comments.isPending)
    return (
      <div aria-busy="true" className="space-y-2 p-3">
        <p className="sr-only">Loading comments</p>
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  if (!posts.length) return <p className="p-4 text-text-muted">No comments on your posts yet.</p>;
  return (
    <>
      <ul className="divide-y divide-border">
        {posts.map((post) => (
          <PostRow key={post.externalPostId} query={query} post={post} />
        ))}
      </ul>
      {comments.hasNextPage ? (
        <div className="p-3">
          <Button
            variant="secondary"
            className="w-full"
            disabled={comments.isFetchingNextPage}
            onClick={() => void comments.fetchNextPage()}
          >
            Show older comments
          </Button>
        </div>
      ) : null}
    </>
  );
}

function PostRow({ query, post }: { query: ChatScreenQuery; post: CommentPost }) {
  const Icon = postIcons[post.channel];
  const current = query.post === post.externalPostId;
  return (
    <li>
      <Link
        href={chatsHref({ ...query, post: post.externalPostId })}
        aria-current={current ? 'page' : undefined}
        className="flex gap-3 p-3 hover:bg-surface-muted aria-[current=page]:bg-surface-muted"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-muted text-info">
          <Icon aria-hidden="true" size={18} strokeWidth={1.75} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate font-semibold">
              {post.caption || postNames[post.channel]}
            </span>
            <time dateTime={post.latestAt} className="shrink-0 text-sm text-text-muted">
              {formatRelativeTime(post.latestAt)}
            </time>
          </span>
          <span className="flex items-center justify-between gap-2 text-text-muted">
            <span className="truncate">
              {post.comments.length} {post.comments.length === 1 ? 'comment' : 'comments'}
            </span>
            {post.toAnswer > 0 ? (
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-on-primary">
                <span className="sr-only">To answer: </span>
                {post.toAnswer}
              </span>
            ) : null}
          </span>
        </span>
      </Link>
    </li>
  );
}

function BackToPosts({ query }: { query: ChatScreenQuery }) {
  return (
    <Link
      href={chatsHref({ ...query, post: undefined })}
      className="inline-flex items-center gap-1 text-action hover:underline lg:hidden"
    >
      <ArrowLeft aria-hidden="true" size={16} strokeWidth={1.75} />
      All posts
    </Link>
  );
}

function PostThread({ query, post }: { query: ChatScreenQuery; post: CommentPost }) {
  const { data: session } = useSessionContext();
  const canEdit = session?.currentStore?.canEditChats ?? false;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="shrink-0 space-y-2 border-b border-border p-4">
        <BackToPosts query={query} />
        <div>
          <p className="text-sm text-text-muted">
            Your {postNames[post.channel]}
            {post.toAnswer > 0 ? ` · ${post.toAnswer} to answer` : ''}
          </p>
          <h2 className="text-lg font-semibold">{post.caption || 'No caption saved'}</h2>
        </div>
      </header>
      <ul className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-surface-muted/40 p-4">
        {post.comments.map((comment) => (
          <CommentCard key={comment.id} comment={comment} canEdit={canEdit} />
        ))}
      </ul>
    </div>
  );
}
