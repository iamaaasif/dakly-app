import { Facebook, Loader2 } from 'lucide-react';

import type { ChannelConnection } from '@dakly/contracts/channels';
import { Button } from '@dakly/ui/button';

import { useConnectMetaAccounts } from '../api/meta-login';
import { metaChannels, type MetaKind } from '../channel-labels';
import { useMetaLogin } from '../hooks/use-meta-login';
import { MetaAccountChoice } from './meta-account-choice';
import { SessionDialog as Dialog } from '@/components/session-dialog';

type MetaConnectDialogProps = {
  kind: MetaKind;
  // Set when the shop reconnects an account Meta no longer accepts.
  reconnecting?: ChannelConnection;
  connections: ChannelConnection[];
  onClose: () => void;
  onConnected: (count: number) => void;
};

export function MetaConnectDialog(props: MetaConnectDialogProps) {
  const { kind, reconnecting, connections, onClose, onConnected } = props;
  const login = useMetaLogin();
  const connect = useConnectMetaAccounts();
  if (login.step === 'waiting') return <WaitingDialog onClose={onClose} />;
  if (login.step === 'choose' && login.accounts) {
    const { selectionId } = login.accounts;
    return (
      <MetaAccountChoice
        kind={kind}
        accounts={login.accounts}
        connections={connections}
        reconnecting={reconnecting}
        pending={connect.isPending}
        error={connect.error?.message}
        onClose={onClose}
        onChoose={(accounts) =>
          connect.mutate(
            { selectionId, accounts },
            { onSuccess: () => onConnected(accounts.length) },
          )
        }
      />
    );
  }
  const title = reconnecting ? `Reconnect ${reconnecting.displayName}` : metaChannels[kind].connect;
  return (
    <Dialog open title={title} onClose={onClose}>
      <p className="text-sm text-text-muted">
        Facebook will ask which Pages Dakly can use. You’ll come straight back here.
      </p>
      <Permissions />
      <p className="mt-3 text-sm text-text-muted">
        You must be an admin of the Page to connect it.
      </p>
      {login.problem ? (
        <p role="alert" className="mt-3 text-sm text-danger">
          {login.problem}
        </p>
      ) : null}
      <div className="mt-6 flex justify-between gap-3 border-t border-border pt-4">
        <Button variant="secondary" onClick={onClose}>
          Back
        </Button>
        <Button
          className="bg-facebook hover:bg-facebook-hover"
          loading={login.starting}
          onClick={login.continueWithFacebook}
        >
          <Facebook aria-hidden="true" size={18} strokeWidth={2} fill="currentColor" />
          Continue with Facebook
        </Button>
      </div>
    </Dialog>
  );
}

function Permissions() {
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <div className="rounded-md bg-success-soft p-3">
        <p className="text-sm font-semibold text-success">Dakly can</p>
        <ul className="mt-2 space-y-1 text-sm text-success">
          <li>Read and answer customer messages</li>
          <li>Publish posts you schedule</li>
          <li>Read likes, comments and reach</li>
        </ul>
      </div>
      <div className="rounded-md bg-surface-muted p-3">
        <p className="text-sm font-semibold">Dakly can’t</p>
        <ul className="mt-2 space-y-1 text-sm">
          <li>See your personal profile</li>
          <li>Post without your approval</li>
        </ul>
      </div>
    </div>
  );
}

function WaitingDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog open title="Waiting for Facebook…" onClose={onClose}>
      <div role="status" className="flex flex-col items-center gap-3 py-6 text-center">
        <Loader2 aria-hidden="true" size={32} className="animate-spin text-action" />
        <p className="text-sm text-text-muted">
          Finish in the Facebook window, then come back here.
        </p>
      </div>
    </Dialog>
  );
}
