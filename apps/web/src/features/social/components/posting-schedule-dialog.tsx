import { useState } from 'react';

import { Dialog } from '@dakly/ui/dialog';
import { QueryError } from '@dakly/ui/query-error';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@dakly/ui/select';
import { Skeleton } from '@dakly/ui/skeleton';

import { usePostingSlots } from '../api/get-posting-slots';
import type { SocialAccount } from '../api/get-social-accounts';
import { PostingScheduleForm } from './posting-schedule-form';

type PostingScheduleDialogProps = {
  accounts: SocialAccount[];
  initialAccountId: string;
  canEdit: boolean;
  onClose: () => void;
  onSaved: () => void;
};

// Slots belong to one account, so the person picks which account's schedule to change.
export function PostingScheduleDialog({
  accounts,
  initialAccountId,
  canEdit,
  onClose,
  onSaved,
}: PostingScheduleDialogProps) {
  const [accountId, setAccountId] = useState(initialAccountId);
  return (
    <Dialog title="Posting schedule" open onClose={onClose}>
      <p className="mb-4 text-text-muted">
        Auto-scheduled posts go out at the next open time below.
      </p>
      {accounts.length > 1 && (
        <div className="mb-4">
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger aria-label="Account">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <AccountSchedule
        key={accountId}
        accountId={accountId}
        canEdit={canEdit}
        onClose={onClose}
        onSaved={onSaved}
      />
    </Dialog>
  );
}

function AccountSchedule({
  accountId,
  ...form
}: { accountId: string } & Omit<React.ComponentProps<typeof PostingScheduleForm>, 'saved'>) {
  const slots = usePostingSlots(accountId);
  if (slots.isError)
    return <QueryError message={slots.error.message} onRetry={() => void slots.refetch()} />;
  if (!slots.data)
    return (
      <div role="status">
        <span className="sr-only">Loading the posting schedule</span>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  return <PostingScheduleForm saved={slots.data} {...form} />;
}
