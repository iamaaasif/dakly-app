import { Button } from '@dakly/ui/button';
import { Dialog } from '@dakly/ui/dialog';

import { useDeleteDraft } from '../api/delete-draft';

type DeleteDraftDialogProps = {
  postId: string;
  title: string;
  onClose: () => void;
  onDeleted: () => void;
};

export function DeleteDraftDialog({ postId, title, onClose, onDeleted }: DeleteDraftDialogProps) {
  const deleteDraft = useDeleteDraft();
  return (
    <Dialog title="Delete this draft?" open closeDisabled={deleteDraft.isPending} onClose={onClose}>
      <p className="break-words">“{title}” will be deleted. This cannot be undone.</p>
      {deleteDraft.isError && (
        <p role="alert" className="mt-3 text-danger">
          {deleteDraft.error.message}
        </p>
      )}
      <div className="mt-6 flex justify-end gap-3">
        <Button variant="secondary" disabled={deleteDraft.isPending} onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="danger"
          loading={deleteDraft.isPending}
          onClick={() => deleteDraft.mutate(postId, { onSuccess: onDeleted })}
        >
          Delete draft
        </Button>
      </div>
    </Dialog>
  );
}
