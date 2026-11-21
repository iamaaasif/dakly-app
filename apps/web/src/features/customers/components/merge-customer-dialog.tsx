import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@dakly/ui/button';

import { useMergeCustomers } from '../api/merge-customers';
import { SessionDialog as Dialog } from '@/components/session-dialog';

type MergeCustomerDialogProps = {
  contactId: string;
  other: { id: string; name: string | null };
  onClose: () => void;
};

export function MergeCustomerDialog({ contactId, other, onClose }: MergeCustomerDialogProps) {
  const router = useRouter();
  const merge = useMergeCustomers();
  // One key per opened dialog, so pressing the button again after a lost reply cannot merge twice.
  const [operationKey] = useState(() => crypto.randomUUID());
  const name = other.name ?? 'this customer';
  return (
    <Dialog open title={`Merge ${name}?`} onClose={onClose}>
      <p className="mb-2">
        The older of the two profiles stays. The chats, orders, tasks and notes of both come
        together on it, and the other profile is hidden.
      </p>
      <p className="mb-4">You can undo the merge for 7 days.</p>
      {merge.error ? (
        <p role="alert" className="mb-4 text-danger">
          {merge.error.message}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          loading={merge.isPending}
          onClick={() =>
            // The profile reloads as not found once the merge lands, which unmounts this dialog, so
            // the move to the kept profile waits on the promise and not on a mutate callback.
            merge
              .mutateAsync({ contactId, otherContactId: other.id, operationKey })
              .then(({ keptContactId }) => router.push(`/customers/${keptContactId}`))
              .catch(() => undefined)
          }
        >
          Merge customers
        </Button>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Dialog>
  );
}
