import Image from 'next/image';

import { Badge } from '@dakly/ui/badge';
import { Button } from '@dakly/ui/button';
import { Dialog } from '@dakly/ui/dialog';

import type { SocialAccount } from '../api/get-social-accounts';
import { attentionReason, statusLabels, type CalendarEntry } from '../post-calendar';
import { postTitle } from './post-chip';
import { formatShortDateTime } from '@/lib/format-date';

const targetLabels = {
  draft: 'Draft',
  waiting_approval: 'Waiting for approval',
  scheduled: 'Scheduled',
  publishing: 'Publishing',
  published: 'Published',
  failed: 'Failed',
  cancelled: 'Cancelled',
} as const;

const targetVariants = {
  draft: 'neutral',
  waiting_approval: 'neutral',
  scheduled: 'neutral',
  publishing: 'neutral',
  published: 'success',
  failed: 'danger',
  cancelled: 'neutral',
} as const;

type PostDetailsDialogProps = {
  entry: CalendarEntry;
  accounts: SocialAccount[];
  onClose: () => void;
};

export function PostDetailsDialog({ entry, accounts, onClose }: PostDetailsDialogProps) {
  const { post } = entry;
  return (
    <Dialog
      title={`${post.kind === 'story' ? 'Story' : 'Post'} · ${statusLabels[entry.status]}`}
      open
      onClose={onClose}
    >
      <p className="break-words whitespace-pre-wrap">{post.caption?.trim() || postTitle(entry)}</p>
      {post.photos.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {post.photos.map((photo) => (
            <li key={photo.id}>
              <Image
                src={photo.url}
                alt=""
                width={64}
                height={64}
                unoptimized
                className="size-16 rounded-md object-cover"
              />
            </li>
          ))}
        </ul>
      )}
      <ul className="mt-4 divide-y divide-border rounded-md border border-border">
        {post.targets.map((target) => {
          const account = accounts.find(({ id }) => id === target.channelConnectionId);
          const reason = attentionReason(post, account, target);
          const time = target.publishedAt ?? target.scheduledFor;
          return (
            <li key={target.id} className="space-y-1 p-3">
              <p className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{account?.displayName ?? 'Removed account'}</span>
                <Badge variant={targetVariants[target.status]}>{targetLabels[target.status]}</Badge>
              </p>
              {time && <p className="text-sm text-text-muted">{formatShortDateTime(time)}</p>}
              {reason && <p className="text-sm text-warning">{reason}</p>}
              {target.errorMessage && <p className="text-sm text-danger">{target.errorMessage}</p>}
            </li>
          );
        })}
      </ul>
      <div className="mt-6 flex justify-end">
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </div>
    </Dialog>
  );
}
