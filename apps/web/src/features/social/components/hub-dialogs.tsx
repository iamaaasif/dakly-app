import { useQueryClient } from '@tanstack/react-query';

import type { SocialAccount } from '../api/get-social-accounts';
import { socialKeys } from '../api/social-keys';
import { ConnectAccountDialog } from './connect-account-dialog';
import { PostingScheduleDialog } from './posting-schedule-dialog';
import type { MetaKind } from '@/components/meta-connect/channel-labels';
import { MetaConnectDialog } from '@/components/meta-connect/meta-connect-dialog';
import { useSessionContext } from '@/lib/session-context';

export type HubDialog =
  | { type: 'choose-account' }
  | { type: 'connect'; kind: MetaKind; reconnecting?: SocialAccount }
  | { type: 'schedule' }
  | null;

type HubDialogsProps = {
  dialog: HubDialog;
  accounts: SocialAccount[];
  onChange: (dialog: HubDialog) => void;
  onNotice: (message: string) => void;
};

export function HubDialogs({ dialog, accounts, onChange, onNotice }: HubDialogsProps) {
  const { data: session } = useSessionContext();
  const client = useQueryClient();
  const [firstAccount] = accounts;
  const close = () => onChange(null);
  if (dialog?.type === 'choose-account')
    return (
      <ConnectAccountDialog
        onClose={close}
        onContinue={(kind) => onChange({ type: 'connect', kind })}
      />
    );
  if (dialog?.type === 'connect')
    return (
      <MetaConnectDialog
        kind={dialog.kind}
        reconnecting={dialog.reconnecting}
        connections={accounts}
        onClose={close}
        onConnected={(count) => {
          void client.invalidateQueries({ queryKey: socialKeys.accounts(session?.contextTag) });
          close();
          onNotice(count === 1 ? 'Account connected.' : `${count} accounts connected.`);
        }}
      />
    );
  if (dialog?.type === 'schedule' && firstAccount)
    return (
      <PostingScheduleDialog
        accounts={accounts}
        initialAccountId={firstAccount.id}
        canEdit={Boolean(session?.currentStore?.canEditSocial)}
        onClose={close}
        onSaved={() => {
          close();
          onNotice('Posting schedule saved.');
        }}
      />
    );
  return null;
}
