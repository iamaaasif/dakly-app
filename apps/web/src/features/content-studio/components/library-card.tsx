'use client';
import { ChevronRight, Eye, Pencil, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import type { ContentPiece } from '@dakly/contracts/content';
import { Button } from '@dakly/ui/button';

import { kindChoices, kindLabel, languageChoices, postKinds } from '../content-studio-labels';
import { CopyButton } from './copy-button';
import { DeletePieceDialog } from './delete-piece-dialog';
import { PieceEditor } from './piece-editor';
import { PreviewDialog } from './preview-dialog';
import { formatShortDate } from '@/lib/format-date';

type Dialog = 'preview' | 'delete' | null;

export function LibraryCard({ piece, canEdit }: { piece: ContentPiece; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const title = kindLabel(piece.kind);
  const close = () => setDialog(null);
  return (
    <article className="flex flex-1 flex-col gap-4 rounded-lg border border-border bg-surface p-4">
      <PieceHeader piece={piece} />
      {editing ? (
        <PieceEditor id={piece.id} body={piece.body} onClose={() => setEditing(false)} />
      ) : (
        <p className="line-clamp-6 wrap-anywhere whitespace-pre-wrap">{piece.body}</p>
      )}
      <div className="mt-auto flex flex-wrap gap-2 border-t border-border pt-4">
        {canEdit && !editing && (
          <Button variant="secondary" className="px-3 text-sm" onClick={() => setEditing(true)}>
            <Pencil aria-hidden="true" size={14} strokeWidth={1.75} /> Edit
          </Button>
        )}
        <CopyButton
          text={piece.body}
          className="px-3 text-sm"
          label={piece.kind === 'product_description' ? 'Copy description' : 'Copy'}
        />
        <Button
          variant="secondary"
          aria-label={`Preview ${title}`}
          onClick={() => setDialog('preview')}
        >
          <Eye aria-hidden="true" size={14} strokeWidth={1.75} />
        </Button>
        {canEdit && (
          <Button
            variant="secondary"
            className="px-2"
            aria-label={`Delete ${title}`}
            onClick={() => setDialog('delete')}
          >
            <Trash2 aria-hidden="true" size={14} strokeWidth={1.75} className="text-danger" />
          </Button>
        )}
        {canEdit && postKinds.includes(piece.kind) && <SchedulePostLink id={piece.id} />}
      </div>
      {dialog === 'preview' && <PreviewDialog title={title} body={piece.body} onClose={close} />}
      {dialog === 'delete' && (
        <DeletePieceDialog id={piece.id} title={piece.body.slice(0, 80)} onClose={close} />
      )}
    </article>
  );
}

function SchedulePostLink({ id }: { id: string }) {
  return (
    <Link
      href={`/social/posts/new?piece=${id}`}
      className="ml-auto inline-flex min-h-10 items-center gap-1 rounded-md bg-action px-3 text-sm font-medium text-on-primary hover:bg-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      Schedule post <ChevronRight aria-hidden="true" size={14} strokeWidth={1.75} />
    </Link>
  );
}

function PieceHeader({ piece }: { piece: ContentPiece }) {
  const { icon: Icon, tile } = kindChoices.find(({ value }) => value === piece.kind)!;
  const language = languageChoices.find(({ value }) => value === piece.language)!.label;
  return (
    <header className="flex items-center gap-3">
      <span className={`grid size-9 shrink-0 place-items-center rounded-md ${tile}`}>
        <Icon aria-hidden="true" size={18} strokeWidth={1.75} />
      </span>
      <div className="min-w-0">
        <h3 className="text-base font-semibold">{kindLabel(piece.kind)}</h3>
        <p className="text-xs text-text-muted">
          {language} · Saved {formatShortDate(piece.createdAt)}
        </p>
      </div>
    </header>
  );
}
