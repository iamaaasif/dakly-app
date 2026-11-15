import type { DeviceSession } from '@dakly/contracts/sessions';
import { Card } from '@dakly/ui/card';
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
    <Card className="space-y-3 break-words">
      <h3 className="font-semibold">
        {device.device}
        {device.isCurrent ? ' · Current device' : ''}
      </h3>
      <p>Last active: {formatDateTime(device.lastSeenAt)}</p>
      <p>IP: {device.ip ?? 'Unknown'}</p>
      <p className="text-sm text-text-muted">{device.userAgent ?? 'No browser details'}</p>
      <Button variant="secondary" onClick={() => onSelect(device)}>
        Sign out device
      </Button>
    </Card>
  );
}
