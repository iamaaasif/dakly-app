import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { ownershipTransferCodeSchema, type MemberResponse } from '@dakly/contracts/team';
import { Button } from '@dakly/ui/button';
import { QueryError } from '@dakly/ui/query-error';

import { useMembers } from '../api/members';
import { useTransferCode } from '../api/transfer-code';
import { TeamError } from './team-error';
import { TeamLoading } from './team-loading';
import { TeamPagination } from './team-pagination';
import { TransferRecipientField } from './transfer-recipient-field';
import { formError } from '@/lib/form-error';
import { useSessionContext } from '@/lib/session-context';

type TransferRecipientProps = { cursor?: string; onSent: (member: MemberResponse) => void };
export function TransferRecipient({ cursor, onSent }: TransferRecipientProps) {
  const members = useMembers(cursor);
  const { data: session } = useSessionContext();
  const form = useForm({
    resolver: zodResolver(ownershipTransferCodeSchema),
    defaultValues: { membershipId: '' },
  });
  const code = useTransferCode();
  if (members.isPending) return <TeamLoading />;
  if (members.error)
    return (
      <QueryError
        message={members.error.message}
        onRetry={() => void members.refetch()}
        retryLabel="Retry members"
      />
    );
  const eligible = members.data.items.filter(
    (member) => member.status === 'active' && member.userId !== session?.user.id,
  );
  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit(async (input) => {
        try {
          await code.mutateAsync(input);
          onSent(eligible.find((member) => member.id === input.membershipId)!);
        } catch (error) {
          formError(error, form.setError);
        }
      })}
    >
      <p>
        Choose the active member who will become the only Owner. You become Admin after they accept.
        A member who already owns a shop cannot accept.
      </p>
      <TransferRecipientField
        members={eligible}
        field={form.register('membershipId')}
        error={form.formState.errors.membershipId}
      />
      {!eligible.length ? (
        <p>No eligible members on this page. Invite a member first, or check another page.</p>
      ) : null}
      <div id="recipient-error">
        <TeamError
          message={
            form.formState.errors.membershipId?.message ?? form.formState.errors.root?.message
          }
        />
      </div>
      <Button type="submit" loading={code.isPending} disabled={!eligible.length}>
        Send ownership code
      </Button>
      <TeamPagination path="/team/ownership" cursor={cursor} nextCursor={members.data.nextCursor} />
    </form>
  );
}
