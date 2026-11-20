import { Laptop } from 'lucide-react';

import type { DeviceSession } from '@dakly/contracts/sessions';
import { Badge } from '@dakly/ui/badge';
import { Button } from '@dakly/ui/button';

import { formatDateTime } from '@/lib/format-date';

export function DeviceCard({
  device,
  onSelect,
}: {
  device: DeviceSession;
  onSelect: (device: DeviceSession) => void;
}) {
  return (
    <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-text-muted">
          <Laptop className="size-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-semibold text-text">{device.device}</h3>
            {device.isCurrent ? <Badge variant="success">This device</Badge> : null}
          </div>
          <p className="text-xs text-text-muted">
            Last active: {formatDateTime(device.lastSeenAt)} · IP: {device.ip ?? 'Unknown'}
          </p>
          <p className="truncate text-xs text-text-muted">
            {device.userAgent ?? 'No browser details'}
          </p>
        </div>
      </div>
      {!device.isCurrent ? (
        <Button
          variant="secondary"
          onClick={() => onSelect(device)}
          className="self-start sm:self-auto"
        >
          Sign out device
        </Button>
      ) : null}
    </li>
  );
}
