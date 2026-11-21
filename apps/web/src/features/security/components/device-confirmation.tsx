import type { DeviceSession } from '@dakly/contracts/sessions';
import { Button } from '@dakly/ui/button';

import { useRevokeAllDevices } from '../api/revoke-all-devices';
import { useRevokeDevice } from '../api/revoke-device';
import { useRevokeOtherDevices } from '../api/revoke-other-devices';
import { useSecurityRefresh } from '../hooks/use-security-refresh';
import { SessionDialog } from '@/components/session-dialog';

export function DeviceConfirmation({
  device,
  onClose,
}: {
  device: DeviceSession | 'others' | 'all';
  onClose: () => void;
}) {
  const revoke = useRevokeDevice();
  const others = useRevokeOtherDevices();
  const everywhere = useRevokeAllDevices();
  const refresh = useSecurityRefresh();
  const error = revoke.error ?? others.error ?? everywhere.error;
  return (
    <SessionDialog open title={dialogTitle(device)} onClose={onClose}>
      <div className="space-y-4">
        <p>{deviceMessage(device)}</p>
        {error ? <p role="alert">{error.message}</p> : null}
        <Button
          variant="danger"
          loading={revoke.isPending || others.isPending || everywhere.isPending}
          onClick={() =>
            void (async () => {
              try {
                if (device === 'all') {
                  await everywhere.mutateAsync();
                  window.location.assign('/sign-in');
                  return;
                }
                if (device === 'others') await others.mutateAsync();
                else await revoke.mutateAsync(device.id);
                onClose();
                await refresh();
              } catch {
                /* The mutation error stays in the confirmation. */
              }
            })()
          }
        >
          Confirm sign out
        </Button>
      </div>
    </SessionDialog>
  );
}

function dialogTitle(device: DeviceSession | 'others' | 'all') {
  if (device === 'all') return 'Sign out of every device?';
  return device === 'others' ? 'Sign out all other devices?' : `Sign out ${device.device}?`;
}

function deviceMessage(device: DeviceSession | 'others' | 'all') {
  if (device === 'all')
    return 'Every active session ends, including this one. You will need to sign in again.';
  if (device === 'others')
    return 'Your current device stays signed in. All other active sessions will end.';
  return device.isCurrent
    ? 'This is your current device. You will need to sign in again.'
    : 'This device will need to sign in again.';
}
