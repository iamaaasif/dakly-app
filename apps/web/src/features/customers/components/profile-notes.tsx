import { useState, type KeyboardEvent } from 'react';

import {
  addCustomerNoteSchema,
  type CustomerNoteResponse,
} from '@dakly/contracts/customer-profile';
import { Button } from '@dakly/ui/button';
import { Textarea } from '@dakly/ui/textarea';
import { useToast } from '@dakly/ui/toast';

import { useAddCustomerNote, useCustomerNotes } from '../api/customer-profile';
import { PartError, RowsSkeleton } from './profile-parts';
import { formatDateSmart } from '@/lib/format-date';

const noteLimit = 2000;

export function ProfileNotes({ contactId, canEdit }: { contactId: string; canEdit: boolean }) {
  const notes = useCustomerNotes(contactId);
  const add = useAddCustomerNote(contactId);
  const showToast = useToast();
  const [draft, setDraft] = useState('');
  const valid = addCustomerNoteSchema.safeParse({ body: draft }).success;

  function save() {
    if (!valid || add.isPending) return;
    add.mutate(draft.trim(), {
      onSuccess: () => {
        setDraft('');
        showToast('Note saved');
      },
    });
  }
  // Ctrl or Cmd with Enter saves, as in the chat reply box.
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      save();
    }
  }

  if (notes.error) return <PartError error={notes.error} onRetry={() => void notes.refetch()} />;
  if (notes.isPending) return <RowsSkeleton label="Loading notes" rows={2} />;
  return (
    <div className="space-y-3">
      {notes.data.map((note) => (
        <NoteCard key={note.id} note={note} />
      ))}
      {canEdit ? (
        <>
          <Textarea
            aria-label="New note"
            placeholder="Sizes, preferences, delivery notes..."
            value={draft}
            maxLength={noteLimit}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
          />
          {add.error ? (
            <p role="alert" className="text-sm text-danger">
              {add.error.message}
            </p>
          ) : null}
          <div className="flex items-center gap-3">
            <Button variant="secondary" disabled={!valid} loading={add.isPending} onClick={save}>
              Save note
            </Button>
            <span className="hidden text-xs text-text-muted sm:inline">Ctrl + Enter to save</span>
          </div>
        </>
      ) : null}
      {!canEdit && !notes.data.length ? (
        <p className="py-6 text-center text-sm text-text-muted">No notes on this customer.</p>
      ) : null}
    </div>
  );
}

function NoteCard({ note }: { note: CustomerNoteResponse }) {
  return (
    <div className="rounded-lg bg-warning-soft px-3 py-2.5">
      <p className="text-base break-words whitespace-pre-wrap">{note.body}</p>
      <p className="mt-1 text-xs text-text-muted">
        {note.authorName ?? 'Someone on the team'} · {formatDateSmart(note.createdAt)}
      </p>
    </div>
  );
}
