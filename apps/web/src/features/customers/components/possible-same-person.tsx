import { ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import type { MatchSuggestionReason, MatchSuggestionResponse } from '@dakly/contracts/contacts';
import { Button } from '@dakly/ui/button';

import { useDismissMatchSuggestion } from '../api/dismiss-match-suggestion';
import { useMatchSuggestions } from '../api/match-suggestions';
import { customerPhone } from '../customer-labels';
import { MergeCustomerDialog } from './merge-customer-dialog';

const reasonText: Record<MatchSuggestionReason, string> = {
  same_phone: 'shares a phone number with this customer, a delivery phone included',
  same_email: 'has the same email',
  similar_name_and_area: 'has a similar name and area',
};

type PossibleSamePersonProps = { contactId: string; canEdit: boolean };

export function PossibleSamePerson({ contactId, canEdit }: PossibleSamePersonProps) {
  const suggestions = useMatchSuggestions(contactId);
  const dismiss = useDismissMatchSuggestion();
  const [merging, setMerging] = useState<{ id: string; name: string | null } | null>(null);
  const [open, setOpen] = useState(false);
  if (!suggestions.data?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-warning-soft px-4 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
            className="inline-flex min-h-8 items-center gap-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            Possible same person
            <ChevronDown
              aria-hidden="true"
              size={16}
              className={`transition-transform duration-150 motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
            />
          </button>
        </h2>
        <span className="text-sm text-text-secondary tabular-nums">
          {suggestions.data.length} to review
        </span>
      </div>
      {open ? (
        <ul className="space-y-3 pt-3">
          {suggestions.data.map((suggestion) => (
            <MatchRow
              key={suggestion.id}
              suggestion={suggestion}
              canEdit={canEdit}
              dismissing={dismiss.isPending && dismiss.variables === suggestion.id}
              onMerge={setMerging}
              onDismiss={(id) => dismiss.mutate(id)}
            />
          ))}
        </ul>
      ) : null}
      {merging ? (
        <MergeCustomerDialog
          contactId={contactId}
          other={merging}
          onClose={() => setMerging(null)}
        />
      ) : null}
      {dismiss.error ? (
        <p role="alert" className="text-sm text-danger">
          {dismiss.error.message}
        </p>
      ) : null}
    </div>
  );
}

type MatchRowProps = {
  suggestion: MatchSuggestionResponse;
  canEdit: boolean;
  dismissing: boolean;
  onMerge: (other: MatchSuggestionResponse['otherContact']) => void;
  onDismiss: (id: string) => void;
};

function MatchRow({ suggestion, canEdit, dismissing, onMerge, onDismiss }: MatchRowProps) {
  const { id, otherContact, reason } = suggestion;
  return (
    <li className="flex flex-wrap items-center justify-between gap-3">
      <div className="text-sm">
        <Link
          href={`/customers/${otherContact.id}`}
          className="font-medium text-action hover:underline"
        >
          {otherContact.name ?? 'No name'}
        </Link>
        <p className="text-text-muted tabular-nums">
          {customerPhone(otherContact)} · {reasonText[reason]}
        </p>
      </div>
      {canEdit ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => onMerge(otherContact)}>
            Merge
          </Button>
          <Button variant="secondary" loading={dismissing} onClick={() => onDismiss(id)}>
            Dismiss
          </Button>
        </div>
      ) : null}
    </li>
  );
}
