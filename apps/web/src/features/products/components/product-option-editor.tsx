'use client';
import { X } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';
import { useFormContext } from 'react-hook-form';

import type { ProductFormValues } from '@dakly/contracts/products';
import { Button } from '@dakly/ui/button';
import { Input } from '@dakly/ui/input';

import {
  MAX_OPTIONS,
  MAX_VARIANTS,
  applyOptions,
  removeOptionAt,
  valueSuggestions,
  type GridOption,
} from '../product-variant-grid';

const optionNameSuggestions = ['Size', 'Colour'];
const dirty = { shouldDirty: true } as const;

export function useGridOptions() {
  const form = useFormContext<ProductFormValues>();
  const options: GridOption[] = form.watch('options') ?? [];
  const variants = form.watch('variants') ?? [];
  const setOptions = (next: GridOption[]) => {
    form.setValue('options', next, dirty);
    form.setValue('variants', applyOptions(options, next, variants), dirty);
  };
  const removeOption = (index: number) => {
    const result = removeOptionAt(options, variants, index);
    form.setValue('options', result.options, dirty);
    form.setValue('variants', result.variants, dirty);
  };
  return { options, variants, setOptions, removeOption };
}

function splitValues(text: string): string[] {
  return text
    .split(/[,\n]/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function variantCount(options: GridOption[]): number {
  return options.reduce((total, option) => total * Math.max(option.values.length, 1), 1);
}

type ProductOptionEditorProps = { onAddOption: () => void };

export function ProductOptionEditor({ onAddOption }: ProductOptionEditorProps) {
  const { options, variants, setOptions, removeOption } = useGridOptions();
  const [message, setMessage] = useState<string | null>(null);
  const change = (index: number, option: GridOption) => {
    const next = options.map((current, position) => (position === index ? option : current));
    if (variantCount(next) > MAX_VARIANTS) {
      setMessage(`A product can have up to ${MAX_VARIANTS} variants. Remove a value first.`);
      return;
    }
    setMessage(null);
    setOptions(next);
  };
  return (
    <div className="space-y-3">
      {options.map((option, index) => (
        <OptionRow
          key={index}
          index={index}
          option={option}
          canRemove={options.length > 1 || variants.length <= 1}
          onChange={(next) => change(index, next)}
          onRemove={() => removeOption(index)}
        />
      ))}
      {options.length < MAX_OPTIONS ? (
        <Button
          type="button"
          variant="secondary"
          className="h-8 px-2.5 text-xs"
          onClick={onAddOption}
        >
          Add option (max {MAX_OPTIONS})
        </Button>
      ) : null}
      {message ? (
        <p role="alert" className="text-sm text-danger">
          {message}
        </p>
      ) : null}
    </div>
  );
}

type OptionRowProps = {
  index: number;
  option: GridOption;
  canRemove: boolean;
  onChange: (option: GridOption) => void;
  onRemove: () => void;
};

function OptionRow({ index, option, canRemove, onChange, onRemove }: OptionRowProps) {
  const title = option.name || `option ${index + 1}`;
  const known = new Set(option.values.map((value) => value.toLowerCase()));
  const addValues = (values: string[]) => {
    const fresh = values.filter(
      (value, position) =>
        !known.has(value.toLowerCase()) &&
        values.findIndex((other) => other.toLowerCase() === value.toLowerCase()) === position,
    );
    if (fresh.length) onChange({ ...option, values: [...option.values, ...fresh] });
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-16 text-sm text-text-muted">Option {index + 1}</span>
      <Input
        aria-label={`Option ${index + 1} name`}
        placeholder="e.g. Size"
        value={option.name}
        className="w-32"
        onChange={(event) => onChange({ ...option, name: event.target.value })}
      />
      {option.name.trim()
        ? null
        : optionNameSuggestions.map((name) => (
            <SuggestionButton
              key={name}
              label={name}
              onClick={() => onChange({ ...option, name })}
            />
          ))}
      {option.values.map((value) => (
        <ValueChip
          key={value}
          value={value}
          optionTitle={title}
          onRemove={() => onChange({ ...option, values: option.values.filter((v) => v !== value) })}
        />
      ))}
      <ValueBox title={title} onAdd={addValues} />
      {valueSuggestions(option.name)
        .filter((value) => !known.has(value.toLowerCase()))
        .slice(0, 3)
        .map((value) => (
          <SuggestionButton key={value} label={value} onClick={() => addValues([value])} />
        ))}
      <button
        type="button"
        disabled={!canRemove}
        title={canRemove ? undefined : 'Remove all but one row first'}
        className="ml-auto text-sm text-text-muted hover:text-danger disabled:cursor-not-allowed disabled:opacity-50"
        onClick={onRemove}
      >
        Remove option {index + 1}
      </button>
    </div>
  );
}

function ValueChip({
  value,
  optionTitle,
  onRemove,
}: {
  value: string;
  optionTitle: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex min-h-8 items-center gap-1 rounded-full border border-border-strong bg-surface px-2.5 text-sm text-text">
      {value}
      <button
        type="button"
        aria-label={`Remove ${value} from ${optionTitle}`}
        className="rounded-full p-0.5 text-text-muted hover:text-danger focus-visible:outline-2 focus-visible:outline-focus"
        onClick={onRemove}
      >
        <X className="size-3.5" aria-hidden="true" />
      </button>
    </span>
  );
}

function ValueBox({ title, onAdd }: { title: string; onAdd: (values: string[]) => void }) {
  const [typed, setTyped] = useState('');
  const commit = () => {
    onAdd(splitValues(typed));
    setTyped('');
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter' && event.key !== ',') return;
    event.preventDefault();
    commit();
  };
  return (
    <Input
      aria-label={`Add a value to ${title}`}
      placeholder="+ type a value"
      value={typed}
      className="w-36"
      onChange={(event) => setTyped(event.target.value)}
      onKeyDown={onKeyDown}
      onBlur={commit}
    />
  );
}

function SuggestionButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={`Add ${label}`}
      className="min-h-8 rounded-full px-1.5 text-sm text-text-muted hover:text-action focus-visible:outline-2 focus-visible:outline-focus"
      onClick={onClick}
    >
      {label}
    </button>
  );
}
