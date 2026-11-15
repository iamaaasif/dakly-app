import { Button } from '@dakly/ui/button';

import { useAcceptInvite } from '../api/accept-invite';
import { InvitationAccount } from './invitation-account';

export function InvitationAccept({
  name,
  token,
  onSignedOut,
  onAccepted,
}: {
  name: string;
  token: string;
  onSignedOut: () => void;
  onAccepted: (storeId: string) => void;
}) {
  const accept = useAcceptInvite();
  return (
    <section className="space-y-4">
      <InvitationAccount name={name} onSignedOut={onSignedOut} />
      <p>
        Accept only if you expected this invitation. Your verified mobile number or email must match
        the invited recipient.
      </p>
      {accept.error ? (
        <div role="alert">
          <p>{accept.error.message}</p>
          <p>
            For an email invitation, verify that email in{' '}
            <a href="/security" className="text-action underline">
              Security
            </a>
            , then reopen the original invitation link.
          </p>
        </div>
      ) : null}
      <Button
        loading={accept.isPending}
        onClick={() =>
          accept.mutate({ token }, { onSuccess: (result) => onAccepted(result.storeId) })
        }
      >
        Accept invitation
      </Button>
    </section>
  );
}
