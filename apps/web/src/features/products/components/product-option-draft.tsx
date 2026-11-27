import { X } from 'lucide-react';
import { useId, useRef, useState } from 'react';

import { Button } from '@dakly/ui/button';
import { Input } from '@dakly/ui/input';
import { Label } from '@dakly/ui/label';
import { MultiSelect } from '@dakly/ui/multi-select';

import { colourSwatches } from '../colour-swatches';
import { optionNameKey, valueSuggestions, type GridOption } from '../product-variant-grid';

// One call adds every piece of a pasted list, so no piece overwrites another.
function matchAdded(values: string[], added: string[]) {
  const known = new Map(values.map((value) => [value.toLowerCase(), value]));
  const chosen: string[] = [];
  const created: string[] = [];
  for (const value of added) {
    const existing = known.get(value.toLowerCase());
    if (!existing) {
      known.set(value.toLowerCase(), value);
      created.push(value);
    }
    chosen.push(existing ?? value);
  }
  return { chosen, created };
}

type OptionDraftProps = {
  option: GridOption;
  onApply: (draft: GridOption) => string | null;
  onCancel: () => void;
  onDelete?: () => void;
};

export function OptionDraft({ option, onApply, onCancel, onDelete }: OptionDraftProps) {
  const [draft, setDraft] = useState(option);
  const [custom, setCustom] = useState(option.values);
  const [error, setError] = useState<string | null>(null);
  const title = draft.name.trim() || 'option';
  const savedValues = [...custom, ...draft.values];
  const known = new Map(savedValues.map((value) => [value.toLowerCase(), value]));
  const presets = valueSuggestions(title).map((value) => known.get(value.toLowerCase()) ?? value);
  const values = [...new Set([...presets, ...savedValues])];
  const addNew = (added: string[]) => {
    const { chosen, created } = matchAdded(values, added);
    setCustom([...custom, ...created]);
    setDraft({ ...draft, values: [...new Set([...draft.values, ...chosen])] });
  };
  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <OptionDraftName
        name={draft.name}
        onChange={(name) => setDraft({ ...draft, name })}
        onApply={() => setError(onApply(draft))}
      />
      <div className="space-y-2">
        <ChipInput
          option={draft}
          label={`Type a value for ${title}`}
          onAdd={addNew}
          onRemove={(value) =>
            setDraft({ ...draft, values: draft.values.filter((current) => current !== value) })
          }
        />
        <MultiSelect
          label={`Add values to ${title}`}
          items={values.map((value) => ({
            value,
            decoration: <ColourSwatch option={title} value={value} />,
          }))}
          selected={draft.values}
          onChange={(next) => setDraft({ ...draft, values: next })}
          onAddValue={(value) => addNew([value])}
        />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <OptionDraftActions
        onCancel={onCancel}
        onDelete={onDelete}
        onApply={() => setError(onApply(draft))}
      />
    </div>
  );
}

type OptionDraftActionsProps = Pick<OptionDraftProps, 'onCancel' | 'onDelete'> & {
  onApply: () => void;
};

function OptionDraftActions({ onCancel, onDelete, onApply }: OptionDraftActionsProps) {
  return (
    <div className="flex flex-wrap justify-end gap-2">
      {onDelete ? (
        <Button variant="danger" className="mr-auto" onClick={onDelete}>
          Delete
        </Button>
      ) : null}
      <Button variant="secondary" aria-label="Cancel option changes" onClick={onCancel}>
        Cancel
      </Button>
      <Button onClick={onApply}>Apply</Button>
    </div>
  );
}

type ChipInputProps = {
  option: GridOption;
  label: string;
  onAdd: (values: string[]) => void;
  onRemove: (value: string) => void;
};

// Enter or a comma turns the typed text into a chip; Backspace on an empty box removes the last one.
function ChipInput({ option, label, onAdd, onRemove }: ChipInputProps) {
  const [text, setText] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const commit = (raw: string) => {
    const pieces = raw
      .split(',')
      .map((piece) => piece.trim())
      .filter(Boolean);
    if (pieces.length) onAdd(pieces);
    setText('');
  };
  return (
    <div
      onClick={() => input.current?.focus()}
      className="flex min-h-11 cursor-text flex-wrap items-center gap-1.5 rounded-md border border-input-border bg-surface p-1.5 focus-within:outline-2 focus-within:outline-focus"
    >
      <OptionChips option={option} onRemove={onRemove} />
      <input
        ref={input}
        aria-label={label}
        value={text}
        placeholder="Add item"
        className="min-w-24 flex-1 bg-transparent px-1.5 py-1 text-sm outline-none placeholder:text-text-muted"
        onChange={(event) => {
          if (event.target.value.includes(',')) commit(event.target.value);
          else setText(event.target.value);
        }}
        onBlur={() => commit(text)}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === 'Enter') {
            event.preventDefault();
            commit(text);
          } else if (event.key === 'Backspace' && !text && option.values.length) {
            onRemove(option.values[option.values.length - 1]!);
          }
        }}
      />
    </div>
  );
}

export function OptionChips({
  option,
  onRemove,
}: {
  option: GridOption;
  onRemove?: (value: string) => void;
}) {
  if (!option.values.length) return null;
  return (
    <div className="contents">
      {option.values.map((value) => (
        <span
          key={value}
          className="inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-md bg-surface-muted px-2.5 text-sm"
        >
          <ColourSwatch option={option.name} value={value} />
          <span className="wrap-anywhere">{value}</span>
          {onRemove ? (
            <Button
              aria-label={`Remove ${value} from ${option.name.trim() || 'option'}`}
              variant="link"
              className="px-0"
              onClick={() => onRemove(value)}
            >
              <X size={16} aria-hidden="true" />
            </Button>
          ) : null}
        </span>
      ))}
    </div>
  );
}

function ColourSwatch({ option, value }: { option: string; value: string }) {
  if (optionNameKey(option) !== 'color') return null;
  const backgroundColor = colourSwatches.get(value.trim().toLowerCase());
  return backgroundColor ? (
    <span
      aria-hidden="true"
      style={{ backgroundColor }}
      className="size-3.5 shrink-0 rounded-full border border-border"
    />
  ) : null;
}

type OptionDraftNameProps = { name: string; onChange: (name: string) => void; onApply: () => void };

function OptionDraftName({ name, onChange, onApply }: OptionDraftNameProps) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="sr-only">
        Option name
      </Label>
      <Input
        id={id}
        autoFocus
        placeholder="Option name, for example Color"
        value={name}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
          event.preventDefault();
          onApply();
        }}
      />
    </div>
  );
}
