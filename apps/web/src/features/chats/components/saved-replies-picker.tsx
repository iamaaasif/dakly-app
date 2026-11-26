'use client';
import { useState } from 'react';

import { Button } from '@dakly/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@dakly/ui/popover';
import { QueryError } from '@dakly/ui/query-error';

import { useSavedReplies } from '../api/saved-replies';
import { InboxIcon } from './inbox-icon';

// Staff choose a saved reply by hand; the AI never picks one (D43).
export function SavedRepliesPicker({
  onPick,
  disabled,
}: {
  onPick: (body: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open && !disabled} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="secondary"
          type="button"
          disabled={disabled}
          className="min-h-9 gap-1.5 rounded-control border-transparent px-2.5 py-1 text-sm"
        >
          <InboxIcon name="saved-replies" />
          Saved replies
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        className="inbox-theme max-h-64 max-w-[calc(100vw-2rem)] overflow-y-auto p-1"
      >
        <div role="menu" aria-label="Saved replies">
          <SavedReplyList
            onPick={(body) => {
              onPick(body);
              setOpen(false);
            }}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SavedReplyList({ onPick }: { onPick: (body: string) => void }) {
  const replies = useSavedReplies(true);
  if (replies.error)
    return (
      <QueryError
        message={replies.error.message}
        onRetry={() => void replies.refetch()}
        retryLabel="Retry saved replies"
      />
    );
  if (replies.isPending) return <p className="p-3 text-text-muted">Loading saved replies</p>;
  if (!replies.data.items.length)
    return <p className="p-3 text-text-muted">No saved replies yet.</p>;
  return replies.data.items.map((reply) => (
    <button
      key={reply.id}
      type="button"
      role="menuitem"
      className="block w-full rounded-sm px-3 py-2 text-left hover:bg-surface-muted"
      onClick={() => onPick(reply.body)}
    >
      <span className="block font-semibold">{reply.title}</span>
      <span className="block truncate text-sm text-text-muted">{reply.body}</span>
    </button>
  ));
}
