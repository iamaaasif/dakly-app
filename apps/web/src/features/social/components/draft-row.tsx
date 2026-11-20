import { Image as ImageIcon, TriangleAlert } from 'lucide-react';

import type { PostResponse } from '@dakly/contracts/social';
import { Badge } from '@dakly/ui/badge';

import type { SocialAccount } from '../api/get-social-accounts';
import { networkNames } from '../social-labels';
import { NetworkIcon } from './network-icon';
import { formatShortDateTime } from '@/lib/format-date';

type DraftRowProps = { draft: PostResponse; accounts: SocialAccount[] };

export function DraftRow({ draft, accounts }: DraftRowProps) {
  const kinds = [
    ...new Set(
      draft.targets.flatMap(({ channelConnectionId }) => {
        const account = accounts.find(({ id }) => id === channelConnectionId);
        return account ? [account.kind] : [];
      }),
    ),
  ].sort();
  const caption = draft.caption?.trim();
  return (
    <li className="flex items-center gap-3 px-4 py-3 md:px-6">
      <span
        aria-hidden="true"
        className="grid size-16 shrink-0 place-items-center rounded-md bg-surface-muted text-text-subtle"
      >
        <ImageIcon size={20} strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <p className={caption ? 'font-semibold break-words' : 'font-semibold text-text-muted'}>
          {caption || 'No caption yet'}
        </p>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-text-muted">
          <span className="flex gap-1">
            {kinds.map((kind) => (
              <NetworkIcon key={kind} kind={kind} size="small" />
            ))}
          </span>
          {kinds.map((kind) => networkNames[kind]).join(' + ') || 'No account chosen'}
          {' · '}
          {draft.kind === 'story' ? 'Story' : 'Post'} · Edited{' '}
          {formatShortDateTime(draft.updatedAt)}
          {draft.isAiWritten && !draft.approvedAt && <Badge variant="ai">Needs your OK</Badge>}
        </p>
        {!caption && !draft.mediaFileIds.length && (
          <p className="flex items-center gap-1 text-sm font-medium text-warning">
            <TriangleAlert aria-hidden="true" size={16} strokeWidth={1.75} /> Add a caption or photo
          </p>
        )}
      </div>
    </li>
  );
}
