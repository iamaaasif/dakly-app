'use client';
import { Eye, EyeOff, Reply, Send } from 'lucide-react';
import { useState } from 'react';

import type { CommentResponse } from '@dakly/contracts/comments';
import { Button } from '@dakly/ui/button';

import { useReplyPrivately, useReplyPublicly, useSetCommentHidden } from '../api/comments';
import { CommentReplyForm } from './comment-reply-form';
import { formatRelativeTime } from '@/lib/format-date';
import { initialsOf } from '@/lib/initials';

type Composer = 'public' | 'private' | null;

const directMessageNames = { messenger: 'Messenger', instagram: 'Instagram' } as const;

function outcomeLine(comment: CommentResponse) {
  const done = [
    comment.publicReplied ? 'Replied under the comment' : null,
    comment.privateRepliedAt ? `Price sent in ${directMessageNames[comment.channel]}` : null,
  ].filter(Boolean);
  return done.join(' · ');
}

export function CommentCard({ comment, canEdit }: { comment: CommentResponse; canEdit: boolean }) {
  const [composer, setComposer] = useState<Composer>(null);
  const name = comment.authorName ?? 'No name';
  return (
    <li className={comment.isReply ? 'ml-10' : undefined}>
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-muted text-xs font-semibold text-text-muted"
        >
          {initialsOf(name)}
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <CommentText comment={comment} name={name} />
          {canEdit && !composer ? (
            <CommentActions comment={comment} onCompose={setComposer} />
          ) : null}
          <CommentComposer
            comment={comment}
            composer={composer}
            onClose={() => setComposer(null)}
          />
        </div>
      </div>
    </li>
  );
}

function CommentText({ comment, name }: { comment: CommentResponse; name: string }) {
  const hidden = comment.status === 'hidden';
  const outcome = outcomeLine(comment);
  return (
    <>
      <div
        className={`inline-flex max-w-full flex-col rounded-lg bg-surface-muted px-3 py-2 ${hidden ? 'opacity-60' : ''}`}
      >
        <b className="font-semibold">{name}</b>
        <span className="break-words">{comment.body}</span>
      </div>
      <p className="pl-3 text-sm text-text-muted">
        {formatRelativeTime(comment.commentedAt)}
        {hidden ? ' · Hidden from the post' : ''}
        {outcome ? <span className="font-medium text-success"> · {outcome}</span> : null}
      </p>
    </>
  );
}

function CommentActions({
  comment,
  onCompose,
}: {
  comment: CommentResponse;
  onCompose: (composer: Composer) => void;
}) {
  const setHidden = useSetCommentHidden();
  const hidden = comment.status === 'hidden';
  return (
    <div className="flex flex-wrap gap-2 pt-1">
      <Button
        variant="secondary"
        disabled={comment.publicReplied || hidden}
        onClick={() => onCompose('public')}
      >
        <Reply aria-hidden="true" size={16} strokeWidth={1.75} />
        Reply
      </Button>
      <Button
        variant="secondary"
        disabled={!comment.canReplyPrivately || hidden}
        title={
          comment.canReplyPrivately
            ? undefined
            : 'Meta allows one private reply for each comment, within 7 days.'
        }
        onClick={() => onCompose('private')}
      >
        <Send aria-hidden="true" size={16} strokeWidth={1.75} />
        Send price by {comment.channel === 'instagram' ? 'DM' : 'Messenger'}
      </Button>
      <HideButton comment={comment} hidden={hidden} setHidden={setHidden} />
    </div>
  );
}

function CommentComposer({
  comment,
  composer,
  onClose,
}: {
  comment: CommentResponse;
  composer: Composer;
  onClose: () => void;
}) {
  const replyPublicly = useReplyPublicly();
  const replyPrivately = useReplyPrivately();
  if (composer === 'public')
    return (
      <CommentReplyForm
        label="Reply under the comment"
        hint="Everyone can read this. Leave out phone numbers, addresses and prices."
        placeholder="ইনবক্সে দাম জানিয়ে দিয়েছি"
        submitLabel="Post reply"
        onCancel={onClose}
        onSubmit={({ body }) => replyPublicly.mutateAsync({ commentId: comment.id, body })}
      />
    );
  if (composer === 'private')
    return (
      <CommentReplyForm
        label="Private message"
        hint="Opens a chat with this person. Meta allows one private reply for each comment."
        placeholder="Women’s Kurti ৳850. M and L are in stock."
        submitLabel="Send privately"
        onCancel={onClose}
        onSubmit={({ body }) => replyPrivately.mutateAsync({ commentId: comment.id, body })}
      />
    );
  return null;
}

function HideButton({
  comment,
  hidden,
  setHidden,
}: {
  comment: CommentResponse;
  hidden: boolean;
  setHidden: ReturnType<typeof useSetCommentHidden>;
}) {
  const Icon = hidden ? Eye : EyeOff;
  return (
    <>
      <Button
        variant="secondary"
        loading={setHidden.isPending}
        onClick={() => setHidden.mutate({ commentId: comment.id, hidden: !hidden })}
      >
        <Icon aria-hidden="true" size={16} strokeWidth={1.75} />
        {hidden ? 'Show comment' : 'Hide comment'}
      </Button>
      {setHidden.error ? (
        <p role="alert" className="w-full text-sm text-danger">
          {setHidden.error.message}
        </p>
      ) : null}
    </>
  );
}
