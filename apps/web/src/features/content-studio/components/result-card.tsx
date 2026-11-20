'use client';
import { useState } from 'react';

import { Textarea } from '@dakly/ui/textarea';

import { useSavePiece } from '../api/save-piece';
import { kindLabel, postKinds } from '../content-studio-labels';
import type { GenerateInput } from './generate-form-types';
import { MakeItTools } from './make-it-tools';
import { PreviewDialog } from './preview-dialog';
import { ResultActions } from './result-actions';
import { UseInPostButton } from './use-in-post-button';

type ResultCardProps = { number: number; text: string; aiRunId: string; asked: GenerateInput };

function OptionHeader({ number, length }: { number: number; length: number }) {
  return (
    <header className="flex items-center justify-between text-xs text-text-muted">
      <span className="font-semibold tracking-wide uppercase">Option {number}</span>
      <span>{length} characters</span>
    </header>
  );
}

export function ResultCard({ number, text, aiRunId, asked }: ResultCardProps) {
  const [piece, setPiece] = useState({
    kind: asked.kind,
    language: asked.language,
    body: text,
    aiRunId,
  });
  const [editing, setEditing] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  // The saved piece's id, so Schedule post reuses it until the text changes.
  const [savedId, setSavedId] = useState<string | null>(null);
  const save = useSavePiece();
  const change = (next: Partial<typeof piece>) => {
    setPiece({ ...piece, ...next });
    setSavedId(null);
  };
  return (
    <article className="space-y-4 rounded-lg border border-border bg-surface p-4 md:p-5">
      <OptionHeader number={number} length={piece.body.length} />
      {editing ? (
        <Textarea
          aria-label="Edit text"
          rows={6}
          value={piece.body}
          onChange={(event) => change({ body: event.target.value })}
        />
      ) : (
        <p className="text-base wrap-anywhere whitespace-pre-wrap">{piece.body}</p>
      )}
      <MakeItTools piece={piece} tone={asked.tone} onEdited={change} />
      {save.error && (
        <p role="alert" className="text-sm text-danger">
          {save.error.message}
        </p>
      )}
      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        <ResultActions
          body={piece.body}
          editing={editing}
          saved={savedId !== null}
          saving={save.isPending}
          onEdit={() => setEditing(!editing)}
          onPreview={() => setPreviewing(true)}
          onSave={() => save.mutate(piece, { onSuccess: ({ id }) => setSavedId(id) })}
        />
        {postKinds.includes(piece.kind) && (
          <UseInPostButton piece={piece} savedId={savedId} onSaved={setSavedId} />
        )}
      </div>
      {previewing && (
        <PreviewDialog
          title={kindLabel(piece.kind)}
          body={piece.body}
          onClose={() => setPreviewing(false)}
        />
      )}
    </article>
  );
}
