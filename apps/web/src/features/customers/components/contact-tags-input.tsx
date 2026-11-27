'use client';
import { PlusCircle, X } from 'lucide-react';
import { useState } from 'react';

import { MAX_CONTACT_TAGS } from '@dakly/contracts/contacts';

type ContactTagsInputProps = {
  id: string;
  tags: string[];
  onChange: (tags: string[]) => void;
};

// A tag is added with Enter or a comma, as in the Segments box of the design.
export function ContactTagsInput({ id, tags, onChange }: ContactTagsInputProps) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const tag = draft.trim().slice(0, 50);
    setDraft('');
    if (tag && !tags.includes(tag) && tags.length < MAX_CONTACT_TAGS) onChange([...tags, tag]);
  };
  return (
    <div className="flex min-h-10 flex-wrap items-center gap-2 rounded-md border border-input-border bg-surface px-3 py-1.5 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-md bg-surface-muted px-2 py-0.5 text-sm"
        >
          {tag}
          <button
            type="button"
            aria-label={`Remove ${tag}`}
            onClick={() => onChange(tags.filter((each) => each !== tag))}
            className="text-text-muted hover:text-text"
          >
            <X aria-hidden="true" size={12} strokeWidth={2} />
          </button>
        </span>
      ))}
      <PlusCircle aria-hidden="true" size={16} strokeWidth={1.75} className="text-text-muted" />
      <input
        id={id}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={add}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ',') {
            event.preventDefault();
            add();
          }
        }}
        placeholder="Add segments"
        className="min-w-24 flex-1 bg-transparent py-1 text-base outline-none placeholder:text-text-muted"
      />
    </div>
  );
}
