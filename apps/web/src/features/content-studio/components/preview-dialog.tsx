import { Button } from '@dakly/ui/button';
import { Dialog } from '@dakly/ui/dialog';

type PreviewDialogProps = { title: string; body: string; onClose: () => void };

export function PreviewDialog({ title, body, onClose }: PreviewDialogProps) {
  return (
    <Dialog title={title} open onClose={onClose}>
      <p className="rounded-md bg-surface-muted p-4 wrap-anywhere whitespace-pre-wrap">{body}</p>
      <div className="mt-6 flex justify-end">
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </div>
    </Dialog>
  );
}
