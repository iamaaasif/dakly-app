import { Button } from './button';

type QueryErrorProps = {
  message: string;
  onRetry: () => void;
  retryLabel?: string;
};

export function QueryError({ message, onRetry, retryLabel = 'Retry' }: QueryErrorProps) {
  return (
    <div role="alert">
      <p>{message}</p>
      <Button onClick={onRetry}>{retryLabel}</Button>
    </div>
  );
}
