import Link from 'next/link';

import { Button } from '@dakly/ui/button';
import { Card } from '@dakly/ui/card';

import { useDismissMatchSuggestion } from '../api/dismiss-match-suggestion';
import { useMatchSuggestions } from '../api/match-suggestions';
import { customerPhone } from '../customer-labels';

type PossibleSamePersonProps = { contactId: string; canEdit: boolean };

// Merging is a separate task (CUS-14), so the note only lists the matches and lets staff dismiss.
export function PossibleSamePerson({ contactId, canEdit }: PossibleSamePersonProps) {
  const suggestions = useMatchSuggestions(contactId);
  const dismiss = useDismissMatchSuggestion();
  if (!suggestions.data?.length) return null;
  return (
    <Card className="space-y-3">
      <h2 className="text-md font-semibold">Possible same person</h2>
      <ul className="space-y-3">
        {suggestions.data.map(({ id, otherContact }) => (
          <li key={id} className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              <Link
                href={`/customers/${otherContact.id}`}
                className="font-medium text-action hover:underline"
              >
                {otherContact.name ?? 'No name'}
              </Link>
              <p className="text-text-muted tabular-nums">
                {customerPhone(otherContact)} · has the same phone number
              </p>
            </div>
            {canEdit ? (
              <Button
                variant="secondary"
                loading={dismiss.isPending && dismiss.variables === id}
                onClick={() => dismiss.mutate(id)}
              >
                Dismiss
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {dismiss.error ? (
        <p role="alert" className="text-sm text-danger">
          {dismiss.error.message}
        </p>
      ) : null}
    </Card>
  );
}
