import { useMutation } from '@tanstack/react-query';

import { Button } from '@dakly/ui/button';

import { apiPost } from '@/lib/api-client';
import { notifySessionChange } from '@/lib/notify-session-change';

export function InvitationAccount({
  name,
  onSignedOut,
}: {
  name: string;
  onSignedOut: () => void;
}) {
  const signOut = useMutation({
    mutationFn: () => apiPost('/auth/sign-out', {}),
    onSuccess: () => {
      notifySessionChange();
      onSignedOut();
    },
  });
  return (
    <div className="space-y-2">
      <p>Signed in as {name}.</p>
      <Button variant="secondary" loading={signOut.isPending} onClick={() => signOut.mutate()}>
        Use another account
      </Button>
      {signOut.error ? <p role="alert">{signOut.error.message}</p> : null}
    </div>
  );
}
