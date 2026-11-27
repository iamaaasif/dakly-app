'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { Tag } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { contactTagSchema, type ContactListItemResponse } from '@dakly/contracts/contacts';
import { formatCount } from '@dakly/contracts/money';
import { Button } from '@dakly/ui/button';
import { Input } from '@dakly/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@dakly/ui/popover';
import { useToast } from '@dakly/ui/toast';

import { useAddTagToCustomers } from '../api/add-tag-to-customers';
import { useSessionContext } from '@/lib/session-context';

type CustomerBulkBarProps = {
  selected: ContactListItemResponse[];
  onClear: () => void;
};

// Slides up inside the card while rows are ticked. Segment and campaign actions wait for an
// API that takes a list of contacts.
export function CustomerBulkBar({ selected, onClear }: CustomerBulkBarProps) {
  const { data: context } = useSessionContext();
  return (
    <div
      role="region"
      aria-label="Selected rows"
      className="motion-rise absolute inset-x-3 bottom-3 z-20 flex flex-wrap items-center gap-2 rounded-lg bg-inverse px-4 py-2 text-on-primary shadow-overlay"
    >
      <p className="mr-auto text-sm font-medium tabular-nums" aria-live="polite">
        {formatCount(selected.length)} selected
      </p>
      {context?.currentStore?.canCreateCustomer ? (
        <AddTagButton selected={selected} onDone={onClear} />
      ) : null}
      <Button variant="link" onClick={onClear} className="px-3 text-on-primary hover:no-underline">
        Clear
      </Button>
    </div>
  );
}

const tagFormSchema = z.object({ tag: contactTagSchema });
type TagForm = z.infer<typeof tagFormSchema>;

function useAddTagForm(selected: ContactListItemResponse[], onDone: () => void) {
  const [open, setOpen] = useState(false);
  const showToast = useToast();
  const addTag = useAddTagToCustomers();
  const form = useForm<TagForm>({
    resolver: zodResolver(tagFormSchema),
    defaultValues: { tag: '' },
  });
  const submit = form.handleSubmit(({ tag }) =>
    addTag.mutate(
      { contacts: selected, tag },
      {
        onSuccess: ({ changed }) => {
          showToast(
            changed
              ? `Added "${tag}" to ${formatCount(changed)} ${changed === 1 ? 'customer' : 'customers'}.`
              : `Every selected customer already has "${tag}".`,
          );
          setOpen(false);
          form.reset();
          onDone();
        },
        onError: () => showToast('The tag could not be added. Try again.'),
      },
    ),
  );
  return { open, setOpen, form, submit, pending: addTag.isPending };
}

function AddTagButton({
  selected,
  onDone,
}: {
  selected: ContactListItemResponse[];
  onDone: () => void;
}) {
  const { open, setOpen, form, submit, pending } = useAddTagForm(selected, onDone);
  const error = form.formState.errors.tag?.message;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="secondary" className="gap-2">
          <Tag aria-hidden="true" size={16} strokeWidth={1.75} /> Add tag
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" align="end">
        <form onSubmit={submit} className="space-y-2">
          <Input
            {...form.register('tag')}
            aria-label="Tag"
            aria-invalid={error ? true : undefined}
            placeholder="Tag name"
            autoFocus
          />
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          <Button type="submit" className="w-full" loading={pending}>
            Add to {formatCount(selected.length)}
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
