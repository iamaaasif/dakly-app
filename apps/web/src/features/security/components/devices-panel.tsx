import Link from 'next/link';
import { useState } from 'react';

import type { DeviceSession } from '@dakly/contracts/sessions';
import { Button } from '@dakly/ui/button';
import { Card } from '@dakly/ui/card';
import { QueryError } from '@dakly/ui/query-error';
import { Skeleton } from '@dakly/ui/skeleton';

import { useDevices } from '../api/devices';
import { DeviceCard } from './device-card';
import { DeviceConfirmation } from './device-confirmation';

export function DevicesPanel({ before }: { before?: string }) {
  const devices = useDevices(before);
  const [selected, setSelected] = useState<DeviceSession | 'others'>();
  if (devices.isPending) return <Skeleton className="h-40 w-full" />;
  if (devices.error)
    return <QueryError message={devices.error.message} onRetry={() => void devices.refetch()} />;
  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-text">Where you&apos;re logged in</h2>
          <p className="text-xs text-text-muted">
            If you don&apos;t recognise a device, log it out and change your password.
          </p>
        </div>
        <Button variant="secondary" onClick={() => setSelected('others')}>
          Sign out other devices
        </Button>
      </div>

      {devices.data.items.length === 0 ? (
        <p className="text-text-muted">No active devices on this page.</p>
      ) : null}
      <Card className="divide-y divide-border overflow-hidden p-0">
        {devices.data.items.map((device) => (
          <DeviceCard key={device.id} device={device} onSelect={setSelected} />
        ))}
      </Card>
      {devices.data.nextCursor ? (
        <Link
          className="inline-flex min-h-10 items-center text-action underline"
          href={`/security?tab=devices&before=${devices.data.nextCursor}`}
        >
          Older devices
        </Link>
      ) : null}
      {before ? (
        <Link
          className="inline-flex min-h-10 items-center text-action underline"
          href="/security?tab=devices"
        >
          Latest devices
        </Link>
      ) : null}
      {selected ? (
        <DeviceConfirmation device={selected} onClose={() => setSelected(undefined)} />
      ) : null}
    </section>
  );
}
