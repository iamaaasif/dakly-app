'use client';
import { type FormEvent, useState } from 'react';

import { formatCount } from '@dakly/contracts/money';
import { Button } from '@dakly/ui/button';
import { Input } from '@dakly/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@dakly/ui/popover';
import { useToast } from '@dakly/ui/toast';

import {
  useAddCustomersToSegment,
  useCreateHandPickedSegment,
  useDeleteSegment,
  useHandPickedSegments,
  useRemoveCustomersFromSegment,
} from '../api/hand-picked-segments';

// Add to segment appends to a segment of picked customers; New segment starts one. Both are
// instant, so each toast offers Undo.
function useSegmentActions(contactIds: string[], onDone: () => void) {
  const showToast = useToast();
  const add = useAddCustomersToSegment();
  const remove = useRemoveCustomersFromSegment();
  const create = useCreateHandPickedSegment();
  const deleteSegment = useDeleteSegment();
  const undoFailed = () => showToast('Could not undo. Try again.');

  const addTo = (segmentId: string, name: string) =>
    add.mutate(
      { segmentId, contactIds },
      {
        onSuccess: ({ changedIds }) => {
          onDone();
          if (!changedIds.length) return showToast(`They are already in ${name}.`);
          showToast(`Added ${formatCount(changedIds.length)} to ${name}.`, {
            label: 'Undo',
            onClick: () =>
              remove.mutate({ segmentId, contactIds: changedIds }, { onError: undoFailed }),
          });
        },
        onError: (error) => showToast(error.message),
      },
    );
  const createNew = (name: string) =>
    create.mutate(
      { name, contactIds },
      {
        onSuccess: (segment) => {
          onDone();
          showToast(`Segment ${segment.name} made with ${formatCount(contactIds.length)}.`, {
            label: 'Undo',
            onClick: () => deleteSegment.mutate(segment.id, { onError: undoFailed }),
          });
        },
        onError: (error) => showToast(error.message),
      },
    );
  return { addTo, createNew, isPending: add.isPending || create.isPending };
}

type CustomerBulkSegmentProps = { contactIds: string[] };

export function CustomerBulkSegment({ contactIds }: CustomerBulkSegmentProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const segments = useHandPickedSegments(open);
  const { addTo, createNew, isPending } = useSegmentActions(contactIds, () => {
    setOpen(false);
    setName('');
  });
  const typed = name.trim();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (typed) createNew(typed);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="link" className="px-3 text-on-primary hover:no-underline">
          Add to segment
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="space-y-3">
        {segments.data?.length ? (
          <ul aria-label="Picked-customer segments" className="max-h-48 space-y-1 overflow-auto">
            {segments.data.map((segment) => (
              <li key={segment.id}>
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full justify-start"
                  disabled={isPending}
                  onClick={() => addTo(segment.id, segment.name)}
                >
                  {segment.name}
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-text-secondary">
            {segments.isPending ? 'Loading segments…' : 'No picked-customer segments yet.'}
          </p>
        )}
        <form onSubmit={submit} className="flex gap-2">
          <Input
            aria-label="New segment name"
            value={name}
            maxLength={80}
            placeholder="New segment name"
            onChange={(event) => setName(event.target.value)}
          />
          <Button type="submit" disabled={!typed || isPending}>
            Make
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
