'use client';
import { List } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@dakly/ui/button';
import { QueryError } from '@dakly/ui/query-error';

import { useSavedReplies } from '../api/saved-replies';

// Staff choose a saved reply by hand; the AI never picks one (D43).
export function SavedRepliesPicker({ onPick }: { onPick: (body: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Button
        variant="secondary"
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <List aria-hidden="true" size={16} strokeWidth={1.75} />
        Saved replies
      </Button>
      {open ? (
        <div
          role="menu"
          aria-label="Saved replies"
          className="absolute bottom-full left-0 z-10 mb-2 max-h-64 w-72 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg border border-border bg-surface p-1 shadow-overlay"
        >
          <SavedReplyList
            onPick={(body) => {
              onPick(body);
              setOpen(false);
            }}
          />
        </div>
      ) : null}
    </div>
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
