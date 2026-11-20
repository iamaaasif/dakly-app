import { Check, Eye, Pencil, Save } from 'lucide-react';

import { Button } from '@dakly/ui/button';

import { CopyButton } from './copy-button';

type ResultActionsProps = {
  body: string;
  editing: boolean;
  saved: boolean;
  saving: boolean;
  onEdit: () => void;
  onPreview: () => void;
  onSave: () => void;
};

export function ResultActions({
  body,
  editing,
  saved,
  saving,
  onEdit,
  onPreview,
  onSave,
}: ResultActionsProps) {
  return (
    <>
      <Button variant="secondary" onClick={onEdit}>
        <Pencil aria-hidden="true" size={14} strokeWidth={1.75} /> {editing ? 'Done' : 'Edit'}
      </Button>
      <CopyButton text={body} />
      <Button variant="secondary" onClick={onPreview}>
        <Eye aria-hidden="true" size={14} strokeWidth={1.75} /> Preview
      </Button>
      <Button variant="secondary" disabled={saved || saving || !body.trim()} onClick={onSave}>
        {saved ? <Check aria-hidden="true" size={14} /> : <Save aria-hidden="true" size={14} />}
        {saved ? 'Saved' : 'Save'}
      </Button>
    </>
  );
}
