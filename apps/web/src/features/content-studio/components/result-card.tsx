'use client';
import { Check, Pencil, Save } from 'lucide-react';
import { useState } from 'react';

import type { ContentPiece } from '@dakly/contracts/content';
import { Button } from '@dakly/ui/button';
import { Textarea } from '@dakly/ui/textarea';

import { useSavePiece } from '../api/save-piece';
import { postKinds } from '../content-studio-labels';
import { CopyButton } from './copy-button';
import { UseInPostButton } from './use-in-post-button';

type ResultCardProps = {
  text: string;
  aiRunId: string;
  kind: ContentPiece['kind'];
  language: ContentPiece['language'];
};

export function ResultCard({ text, aiRunId, kind, language }: ResultCardProps) {
  const [body, setBody] = useState(text);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const save = useSavePiece();
  const piece = { kind, language, body, aiRunId };
  const empty = !body.trim();
  return (
    <article className="space-y-3 rounded-lg border border-border bg-surface p-4">
      {editing ? (
        <Textarea
          aria-label="Edit text"
          rows={6}
          value={body}
          onChange={(event) => {
            setBody(event.target.value);
            setSaved(false);
          }}
        />
      ) : (
        <p className="wrap-anywhere whitespace-pre-wrap">{body}</p>
      )}
      {save.error && (
        <p role="alert" className="text-sm text-danger">
          {save.error.message}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <CopyButton text={body} />
        <Button variant="secondary" onClick={() => setEditing(!editing)}>
          <Pencil aria-hidden="true" size={14} strokeWidth={1.75} /> {editing ? 'Done' : 'Edit'}
        </Button>
        <Button
          variant="secondary"
          disabled={saved || save.isPending || empty}
          onClick={() => save.mutate(piece, { onSuccess: () => setSaved(true) })}
        >
          {saved ? <Check aria-hidden="true" size={14} /> : <Save aria-hidden="true" size={14} />}
          {saved ? 'Saved to library' : 'Save to library'}
        </Button>
        {postKinds.includes(kind) && <UseInPostButton piece={piece} />}
      </div>
    </article>
  );
}
