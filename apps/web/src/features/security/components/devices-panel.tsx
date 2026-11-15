import { useState } from 'react';
import Link from 'next/link';
import type { DeviceSession } from '@dakly/contracts/sessions';
import { Button } from '@dakly/ui/button';
import { DeviceCard } from './device-card';
import { Skeleton } from '@dakly/ui/skeleton';
import { useDevices } from '../api/devices';
import { DeviceConfirmation } from './device-confirmation';
export function DevicesPanel({ before }: { before?: string }) {
  const devices = useDevices(before);
  const [selected, setSelected] = useState<DeviceSession | 'others'>();
  if (devices.isPending) return <Skeleton className="h-40 w-full" />;
  if (devices.error)
    return (
      <div role="alert">
        <p>{devices.error.message}</p>
        <Button onClick={() => void devices.refetch()}>Retry</Button>
      </div>
    );
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Devices</h2>

      <Button variant="secondary" onClick={() => setSelected('others')}>
        Sign out other devices
      </Button>

      {devices.data.items.length === 0 ? <p>No active devices on this page.</p> : null}
      {devices.data.items.map((device) => (
        <DeviceCard key={device.id} device={device} onSelect={setSelected} />
      ))}
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
