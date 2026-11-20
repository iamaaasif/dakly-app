import { CircleX, TriangleAlert } from 'lucide-react';

import { cn } from '@dakly/ui/cn';

import { statusLabels, type CalendarEntry, type CalendarStatus } from '../post-calendar';
import { NetworkIcon } from './network-icon';
import { formatTime } from '@/lib/format-date';

const tones: Record<CalendarStatus, string> = {
  scheduled: 'border-warning-soft bg-warning-soft',
  needs_attention: 'border-danger bg-danger-soft',
  published: 'border-success-soft bg-success-soft',
  failed: 'border-danger bg-danger-soft',
};

export const statusDots: Record<CalendarStatus, string> = {
  scheduled: 'bg-warning',
  needs_attention: 'bg-danger',
  published: 'bg-success',
  failed: 'bg-danger',
};

const statusIcons = { needs_attention: TriangleAlert, failed: CircleX };

export function postTitle(entry: CalendarEntry): string {
  return entry.post.caption?.trim() || (entry.post.kind === 'story' ? 'Story' : 'No caption');
}

type PostChipProps = { entry: CalendarEntry; onOpen: (entry: CalendarEntry) => void };

export function PostChip({ entry, onOpen }: PostChipProps) {
  const time = formatTime(entry.at);
  const title = postTitle(entry);
  const StatusIcon =
    entry.status in statusIcons ? statusIcons[entry.status as keyof typeof statusIcons] : null;
  return (
    <button
      type="button"
      aria-label={`${time}, ${title}, ${statusLabels[entry.status]}`}
      onClick={() => onOpen(entry)}
      className={cn(
        'flex w-full min-w-0 flex-col items-center gap-1 rounded-md border px-1.5 py-1 text-left text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus md:flex-row',
        tones[entry.status],
      )}
    >
      {/* A chip that needs attention shows its state instead of the networks, so the caption stays readable. */}
      <span aria-hidden="true" className={cn('flex shrink-0 gap-0.5', StatusIcon && 'md:hidden')}>
        {entry.kinds.map((kind) => (
          <NetworkIcon key={kind} kind={kind} size="small" />
        ))}
      </span>
      {StatusIcon && (
        <StatusIcon
          aria-hidden="true"
          size={14}
          strokeWidth={1.75}
          className="hidden shrink-0 md:block"
        />
      )}
      <span aria-hidden="true" className="hidden min-w-0 flex-1 truncate md:block">
        <span className="font-medium">{time}</span> {title}
      </span>
    </button>
  );
}
