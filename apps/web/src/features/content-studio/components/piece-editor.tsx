import { useState } from 'react';

import { Button } from '@dakly/ui/button';
import { Textarea } from '@dakly/ui/textarea';

import { useUpdatePiece } from '../api/update-piece';

type PieceEditorProps = { id: string; body: string; onClose: () => void };

export function PieceEditor({ id, body, onClose }: PieceEditorProps) {
  const [draft, setDraft] = useState(body);
  const update = useUpdatePiece(id);
  return (
    <div className="space-y-2">
      <Textarea
        aria-label="Edit text"
        rows={6}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
      {update.error && (
        <p role="alert" className="text-sm text-danger">
          {update.error.message}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          loading={update.isPending}
          disabled={!draft.trim()}
          onClick={() => update.mutate(draft, { onSuccess: onClose })}
        >
          Save changes
        </Button>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
