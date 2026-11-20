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

export function ResultCard({ number, text, aiRunId, asked }: ResultCardProps) {
  const [piece, setPiece] = useState({
    kind: asked.kind,
    language: asked.language,
    body: text,
    aiRunId,
  });
  const [editing, setEditing] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [saved, setSaved] = useState(false);
  const save = useSavePiece();
  const change = (next: Partial<typeof piece>) => {
    setPiece({ ...piece, ...next });
    setSaved(false);
  };
  return (
    <article className="space-y-4 rounded-lg border border-border bg-surface p-4 md:p-5">
      <header className="flex items-center justify-between text-xs text-text-muted">
        <span className="font-semibold tracking-wide uppercase">Option {number}</span>
        <span>{piece.body.length} characters</span>
      </header>
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
          saved={saved}
          saving={save.isPending}
          onEdit={() => setEditing(!editing)}
          onPreview={() => setPreviewing(true)}
          onSave={() => save.mutate(piece, { onSuccess: () => setSaved(true) })}
        />
        {postKinds.includes(piece.kind) && <UseInPostButton piece={piece} />}
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
