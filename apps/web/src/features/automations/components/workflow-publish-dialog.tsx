import { Button } from '@dakly/ui/button';

import { SessionDialog } from '@/components/session-dialog';

type Props = {
  count: number;
  paused: boolean;
  error?: string;
  pending: boolean;
  onClose: () => void;
  onPublish: () => void;
};

export function WorkflowPublishDialog({
  count,
  paused,
  error,
  pending,
  onClose,
  onPublish,
}: Props) {
  return (
    <SessionDialog
      open
      title={paused ? 'Publish and enable workflow?' : 'Publish workflow?'}
      onClose={onClose}
      closeDisabled={pending}
    >
      <p>{count === 1 ? '1 person is' : `${count} people are`} in this workflow now.</p>
      <p className="mt-2 text-sm text-text-muted">People keep their current version.</p>
      {error && (
        <p role="alert" className="mt-2 text-danger">
          {error}
        </p>
      )}
      <Button className="mt-4" onClick={onPublish} loading={pending}>
        Publish workflow
      </Button>
    </SessionDialog>
  );
}
