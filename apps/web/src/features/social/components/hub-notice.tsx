import { cn } from '@dakly/ui/cn';

type HubNoticeProps = { message: string; tone?: 'error' };

export function HubNotice({ message, tone }: HubNoticeProps) {
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'rounded-md p-3 text-sm',
        tone === 'error' ? 'bg-danger-soft text-danger' : 'bg-success-soft text-success',
      )}
    >
      {message}
    </p>
  );
}
