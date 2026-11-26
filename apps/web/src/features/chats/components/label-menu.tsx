'use client';
import { useState } from 'react';

import type { ConversationResponse } from '@dakly/contracts/chats';
import { Button } from '@dakly/ui/button';
import { Checkbox } from '@dakly/ui/checkbox';
import { Input } from '@dakly/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@dakly/ui/popover';

import { useChangeLabel } from '../api/conversation-actions';
import { useConversationLabels } from '../api/conversations';
import { InboxIcon } from './inbox-icon';

// Labels are the customer's tags, so a label put here shows on the customer profile too.
export function LabelMenu({ conversation }: { conversation: ConversationResponse }) {
  const change = useChangeLabel(conversation.id);
  const known = useConversationLabels();
  const options = [...new Set([...(known.data ?? []), ...conversation.labels])].sort();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="secondary"
          className="min-h-10 rounded-md border-border-strong px-2.5 py-1 text-sm md:min-h-inbox-control"
        >
          <InboxIcon name="label" />
          Label
          {conversation.labels.length ? ` (${conversation.labels.length})` : ''}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="inbox-theme" aria-label="Labels">
        <div className="space-y-3">
          <ul className="max-h-48 space-y-1 overflow-y-auto">
            {options.map((label) => (
              <li key={label}>
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={conversation.labels.includes(label)}
                    disabled={change.isPending}
                    onCheckedChange={(checked) =>
                      change.mutate({ label, change: checked ? 'add' : 'remove' })
                    }
                  />
                  {label}
                </label>
              </li>
            ))}
          </ul>
          <NewLabelForm
            onAdd={(label, done) => change.mutate({ label, change: 'add' }, { onSuccess: done })}
          />
          {change.error ? (
            <p role="alert" className="text-danger">
              {change.error.message}
            </p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function NewLabelForm({ onAdd }: { onAdd: (label: string, done: () => void) => void }) {
  const [draft, setDraft] = useState('');
  const label = draft.trim();
  return (
    <form
      className="flex gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (label) onAdd(label, () => setDraft(''));
      }}
    >
      <Input
        aria-label="New label"
        placeholder="New label"
        maxLength={50}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
      <Button type="submit" variant="secondary" disabled={!label}>
        Add
      </Button>
    </form>
  );
}
