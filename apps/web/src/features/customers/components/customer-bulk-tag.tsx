'use client';
import { type FormEvent, useState } from 'react';

import { formatCount } from '@dakly/contracts/money';
import { Button } from '@dakly/ui/button';
import { Input } from '@dakly/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@dakly/ui/popover';
import { useToast } from '@dakly/ui/toast';

import { useAddTagToCustomers, useRemoveTagFromCustomers } from '../api/bulk-tags';
import { useContactTags } from '../api/contact-tags';

const SUGGESTION_LIMIT = 6;

type CustomerBulkTagProps = { contactIds: string[] };

// Adds the tag and offers Undo for the customers it changed, as the toast's action.
function useApplyTag(contactIds: string[], onApplied: () => void) {
  const showToast = useToast();
  const add = useAddTagToCustomers();
  const remove = useRemoveTagFromCustomers();
  const apply = (tag: string) =>
    add.mutate(
      { contactIds, tag },
      {
        onSuccess: ({ changedIds, unchanged }) => {
          onApplied();
          const skipped = unchanged
            ? ` ${formatCount(unchanged)} already had it, were full or are gone.`
            : '';
          if (!changedIds.length) return showToast(`No customer changed.${skipped}`);
          showToast(`Tag "${tag}" added to ${formatCount(changedIds.length)}.${skipped}`, {
            label: 'Undo',
            onClick: () =>
              remove.mutate(
                { contactIds: changedIds, tag },
                { onError: () => showToast('Could not undo. Try again.') },
              ),
          });
        },
        onError: () => showToast('Could not add the tag. Try again.'),
      },
    );
  return { apply, isPending: add.isPending };
}

export function CustomerBulkTag({ contactIds }: CustomerBulkTagProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const { apply, isPending } = useApplyTag(contactIds, () => {
    setOpen(false);
    setText('');
  });
  const tags = useContactTags();
  const typed = text.trim();
  const suggestions = (tags.data ?? [])
    .filter((tag) => tag.toLowerCase().includes(typed.toLowerCase()))
    .slice(0, SUGGESTION_LIMIT);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (typed) apply(typed);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="link" className="px-3 text-on-primary hover:no-underline">
          Add tag
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="space-y-2">
        <form onSubmit={submit} className="flex gap-2">
          <Input
            aria-label="Tag"
            value={text}
            maxLength={50}
            placeholder="Type or pick a tag"
            onChange={(event) => setText(event.target.value)}
          />
          <Button type="submit" disabled={!typed || isPending}>
            Add
          </Button>
        </form>
        {suggestions.length ? (
          <ul className="flex flex-wrap gap-1.5" aria-label="Existing tags">
            {suggestions.map((tag) => (
              <li key={tag}>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={isPending}
                  onClick={() => apply(tag)}
                >
                  {tag}
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
