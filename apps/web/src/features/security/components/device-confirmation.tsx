import type { DeviceSession } from '@dakly/contracts/sessions';
import { Button } from '@dakly/ui/button';

import { useRevokeDevice } from '../api/revoke-device';
import { useRevokeOtherDevices } from '../api/revoke-other-devices';
import { useSecurityRefresh } from '../hooks/use-security-refresh';
import { SessionDialog } from '@/components/session-dialog';

export function DeviceConfirmation({
  device,
  onClose,
}: {
  device: DeviceSession | 'others';
  onClose: () => void;
}) {
  const revoke = useRevokeDevice();
  const others = useRevokeOtherDevices();
  const refresh = useSecurityRefresh();
  const error = revoke.error ?? others.error;
  return (
    <SessionDialog
      open
      title={device === 'others' ? 'Sign out all other devices?' : `Sign out ${device.device}?`}
      onClose={onClose}
    >
      <div className="space-y-4">
        <p>{deviceMessage(device)}</p>
        {error ? <p role="alert">{error.message}</p> : null}
        <Button
          variant="danger"
          loading={revoke.isPending || others.isPending}
          onClick={() =>
            void (async () => {
              try {
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

function deviceMessage(device: DeviceSession | 'others') {
  if (device === 'others')
    return 'Your current device stays signed in. All other active sessions will end.';
  return device.isCurrent
    ? 'This is your current device. You will need to sign in again.'
    : 'This device will need to sign in again.';
}
