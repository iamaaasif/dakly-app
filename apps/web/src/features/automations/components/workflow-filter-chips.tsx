import { X } from 'lucide-react';
import { useState } from 'react';

import { cn } from '@dakly/ui/cn';
import { Input } from '@dakly/ui/input';

import { addKeywords } from '../workflow-trigger-filters';

type ChoiceProps<Value extends string> = {
  label: string;
  choices: readonly { value: Value; label: string }[];
  selected: readonly Value[];
  onToggle: (value: Value) => void;
};

// Nothing selected means the filter is off, so the hint says what that does.
export function ChoiceChips<Value extends string>({
  label,
  choices,
  selected,
  onToggle,
}: ChoiceProps<Value>) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {choices.map((choice) => {
          const on = selected.includes(choice.value);
          return (
            <button
              key={choice.value}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(choice.value)}
              className={cn(
                'h-9 rounded-full border px-3 text-sm transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
                on
                  ? 'border-action bg-primary-soft font-medium text-action-hover'
                  : 'border-border bg-surface hover:border-border-strong hover:bg-surface-muted',
              )}
            >
              {choice.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

type KeywordProps = { keywords: readonly string[]; onChange: (keywords: string[]) => void };

const MAX_KEYWORDS = 20;

function KeywordList({ keywords, onChange }: KeywordProps) {
  if (keywords.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {keywords.map((word) => (
        <li
          key={word}
          className="flex h-8 items-center gap-1 rounded-full bg-primary-soft pr-1 pl-3 text-sm text-action-hover"
        >
          {word}
          <button
            type="button"
            aria-label={`Remove ${word}`}
            onClick={() => onChange(keywords.filter((item) => item !== word))}
            className="grid size-6 place-items-center rounded-full hover:bg-surface/60"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );
}

export function KeywordChips({ keywords, onChange }: KeywordProps) {
  const [typed, setTyped] = useState('');
  function commit() {
    if (!typed.trim()) return;
    onChange(addKeywords(keywords, typed).slice(0, MAX_KEYWORDS));
    setTyped('');
  }
  return (
    <div className="space-y-2">
      <label htmlFor="trigger-keywords" className="text-sm font-medium">
        Keywords
      </label>
      <KeywordList keywords={keywords} onChange={onChange} />
      <Input
        id="trigger-keywords"
        value={typed}
        disabled={keywords.length >= MAX_KEYWORDS}
        placeholder="দাম কত, dam koto, price"
        onChange={(event) => setTyped(event.target.value)}
        onBlur={commit}
        onPaste={(event) => {
          event.preventDefault();
          onChange(
            addKeywords(keywords, event.clipboardData.getData('text')).slice(0, MAX_KEYWORDS),
          );
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ',') {
            event.preventDefault();
            commit();
          } else if (event.key === 'Backspace' && !typed && keywords.length > 0) {
            onChange(keywords.slice(0, -1));
          }
        }}
      />
      <p className="text-sm text-text-muted">
        Any one of these words starts the flow. Capital letters and Bangla digits do not matter.
        Leave empty to match every comment.
      </p>
    </div>
  );
}
