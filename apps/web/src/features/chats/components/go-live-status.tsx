import { ApiError } from '@dakly/ui/api-client';
import { Button } from '@dakly/ui/button';

type GoLiveStatusProps = {
  pending: boolean;
  error: Error | null;
  onCheckAgain: () => void;
};

// A cut-off request says nothing about the outcome: the API may still finish and go live.
function wasCutOff(error: unknown) {
  return !(error instanceof ApiError) || error.status === undefined || error.status >= 500;
}

export function GoLiveStatus({ pending, error, onCheckAgain }: GoLiveStatusProps) {
  if (pending)
    return (
      <div role="status" className="space-y-2">
        <p>Dakly is answering your test questions. This can take a minute. Keep this open.</p>
        <div aria-hidden="true" className="h-2 animate-pulse rounded-full bg-action" />
      </div>
    );
  if (!error) return null;
  if (!wasCutOff(error))
    return (
      <p role="alert" className="text-danger">
        {error.message}
      </p>
    );
  return (
    <div role="alert" className="space-y-2">
      <p>
        The check took longer than the page waited. Dakly may still be finishing, so look again
        before you try twice.
      </p>
      <Button variant="secondary" onClick={onCheckAgain}>
        Check again
      </Button>
    </div>
  );
}
