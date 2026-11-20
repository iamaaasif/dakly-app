import { Copy, Image as ImageIcon, Trash2, TriangleAlert } from 'lucide-react';

import type { PostResponse } from '@dakly/contracts/social';
import { Badge } from '@dakly/ui/badge';
import { Button } from '@dakly/ui/button';

import type { SocialAccount } from '../api/get-social-accounts';
import { networkNames } from '../social-labels';
import { NetworkIcon } from './network-icon';
import { formatShortDateTime } from '@/lib/format-date';

type DraftRowProps = {
  draft: PostResponse;
  accounts: SocialAccount[];
  canEdit: boolean;
  duplicating: boolean;
  onDuplicate: () => void;
  onDelete: () => void;
};

export function DraftRow({
  draft,
  accounts,
  canEdit,
  duplicating,
  onDuplicate,
  onDelete,
}: DraftRowProps) {
  const label = draft.caption?.trim().slice(0, 40) || 'no caption';
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3 md:px-6">
      <span
        aria-hidden="true"
        className="grid size-16 shrink-0 place-items-center rounded-md bg-surface-muted text-text-subtle"
      >
        <ImageIcon size={20} strokeWidth={1.75} />
      </span>
      <DraftSummary draft={draft} accounts={accounts} />
      {canEdit && (
        <div className="flex gap-1">
          <Button
            variant="secondary"
            aria-label={`Duplicate draft: ${label}`}
            className="px-2"
            loading={duplicating}
            onClick={onDuplicate}
          >
            <Copy aria-hidden="true" size={16} strokeWidth={1.75} />
          </Button>
          <Button
            variant="secondary"
            aria-label={`Delete draft: ${label}`}
            className="px-2"
            onClick={onDelete}
          >
            <Trash2 aria-hidden="true" size={16} strokeWidth={1.75} />
          </Button>
        </div>
      )}
    </li>
  );
}

function DraftSummary({ draft, accounts }: Pick<DraftRowProps, 'draft' | 'accounts'>) {
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
    <div className="min-w-48 flex-1 space-y-1">
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
        {draft.kind === 'story' ? 'Story' : 'Post'} · Edited {formatShortDateTime(draft.updatedAt)}
        {draft.isAiWritten && !draft.approvedAt && <Badge variant="ai">Needs your OK</Badge>}
      </p>
      {!caption && !draft.mediaFileIds.length && (
        <p className="flex items-center gap-1 text-sm font-medium text-warning">
          <TriangleAlert aria-hidden="true" size={16} strokeWidth={1.75} /> Add a caption or photo
        </p>
      )}
    </div>
  );
}
