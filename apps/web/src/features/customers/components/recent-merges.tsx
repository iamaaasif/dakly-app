import { useRouter } from 'next/navigation';

import { Button } from '@dakly/ui/button';
import { Card } from '@dakly/ui/card';
import { useToast } from '@dakly/ui/toast';

import { useUndoMerge } from '../api/merge-customers';
import { useUndoableMerges } from '../api/undoable-merges';
import { formatDateTime } from '@/lib/format-date';

type RecentMergesProps = { contactId: string; canEdit: boolean };

// Merges of this customer that can still be undone, newest first (D29: seven days).
export function RecentMerges({ contactId, canEdit }: RecentMergesProps) {
  const merges = useUndoableMerges(contactId);
  const undo = useUndoMerge();
  const router = useRouter();
  const showToast = useToast();
  if (!merges.data?.length) return null;
  return (
    <Card className="space-y-3">
      <h2 className="text-md font-semibold">Recent merges</h2>
      <ul className="space-y-3">
        {merges.data.map(({ id, mergedContactId, mergedContactName, undoUntil }) => (
          <li key={id} className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              <p className="font-medium">Merged with {mergedContactName ?? 'a customer'}</p>
              <p className="text-text-muted">You can undo this until {formatDateTime(undoUntil)}</p>
            </div>
            {canEdit ? (
              <Button
                variant="secondary"
                loading={undo.isPending && undo.variables === id}
                onClick={() =>
                  undo.mutate(id, {
                    onSuccess: ({ undoConflicts }) => {
                      showToast(
                        undoConflicts.length
                          ? `Merge undone. ${undoConflicts.length} later changes were kept as they are.`
                          : 'Merge undone.',
                      );
                      router.push(`/customers/${mergedContactId}`);
                    },
                  })
                }
              >
                Undo merge
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {undo.error ? (
        <p role="alert" className="text-sm text-danger">
          {undo.error.message}
        </p>
      ) : null}
    </Card>
  );
}
