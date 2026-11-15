import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { startOwnershipTransferSchema, type MemberResponse } from '@dakly/contracts/team';
import { Button } from '@dakly/ui/button';
import { formError } from '@/lib/form-error';
import { useStartTransfer } from '../api/start-transfer';
import { TeamField } from './team-field';
import { TeamError } from './team-error';
export function TransferCodeForm({
  member,
  onBack,
}: {
  member: MemberResponse;
  onBack: () => void;
}) {
  const form = useForm({
    resolver: zodResolver(startOwnershipTransferSchema),
    defaultValues: { membershipId: member.id, code: '' },
  });
  const start = useStartTransfer();
  return (
    <form
      method="post"
      className="space-y-4"
      onSubmit={form.handleSubmit(async (input) => {
        try {
          await start.mutateAsync(input);
          form.resetField('code');
        } catch (error) {
          formError(error, form.setError);
        }
      })}
    >
      <p>
        Transfer ownership to <strong>{member.name ?? member.email ?? member.phone}</strong>. A
        fresh code was sent to your verified email, or mobile if you have no verified email. It
        expires after ten minutes.
      </p>
      <TeamField
        label="Ownership code"
        field={form.register('code')}
        error={form.formState.errors.code}
        inputMode="numeric"
        autoComplete="one-time-code"
      />
      <TeamError message={form.formState.errors.root?.message} />
      <div className="flex flex-wrap gap-3">
        <Button type="submit" loading={start.isPending}>
          Start ownership transfer
        </Button>
        <Button variant="secondary" onClick={onBack}>
          Choose again or request a new code
        </Button>
      </div>
    </form>
  );
}
