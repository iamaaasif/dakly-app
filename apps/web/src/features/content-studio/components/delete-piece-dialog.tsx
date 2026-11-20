import { Button } from '@dakly/ui/button';
import { Dialog } from '@dakly/ui/dialog';

import { useDeletePiece } from '../api/delete-piece';

type DeletePieceDialogProps = { id: string; title: string; onClose: () => void };

export function DeletePieceDialog({ id, title, onClose }: DeletePieceDialogProps) {
  const remove = useDeletePiece();
  return (
    <Dialog title="Delete this writing?" open closeDisabled={remove.isPending} onClose={onClose}>
      <p className="break-words">
        “{title}” will be deleted from your library. This cannot be undone.
      </p>
      {remove.isError && (
        <p role="alert" className="mt-3 text-danger">
          {remove.error.message}
        </p>
      )}
      <div className="mt-6 flex justify-end gap-3">
        <Button variant="secondary" disabled={remove.isPending} onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="danger"
          loading={remove.isPending}
          onClick={() => remove.mutate(id, { onSuccess: onClose })}
        >
          Delete
        </Button>
      </div>
    </Dialog>
  );
}
