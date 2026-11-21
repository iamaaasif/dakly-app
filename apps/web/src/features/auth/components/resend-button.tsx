import { Button } from '@dakly/ui/button';

export function ResendButton({
  seconds,
  label,
  loading,
  onClick,
}: {
  seconds: number;
  label: string;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <Button variant="secondary" disabled={seconds > 0} loading={loading} onClick={onClick}>
      {label}
    </Button>
  );
}
