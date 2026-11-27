'use client';

import { Plus } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';

import { Button } from './button';
import { Checkbox } from './checkbox';
import { Input } from './input';
import { Label } from './label';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

type MultiSelectItem = { value: string; decoration?: ReactNode };

type MultiSelectProps = {
  label: string;
  items: MultiSelectItem[];
  selected: string[];
  onChange: (values: string[]) => void;
  onAddValue: (value: string) => void;
};

export function MultiSelect({ label, items, selected, onChange, onAddValue }: MultiSelectProps) {
  const id = useId();
  const checked = new Set(selected);
  const allSelected = items.length > 0 && items.every(({ value }) => checked.has(value));
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="secondary" aria-label={label}>
          <Plus size={16} aria-hidden="true" />
          Add values
        </Button>
      </PopoverTrigger>
      <PopoverContent aria-label={label} className="space-y-2">
        {items.length > 0 ? (
          <div className="max-h-56 overflow-y-auto">
            <Choice
              id={`${id}-all`}
              label="Select all"
              checked={allSelected || (selected.length > 0 ? 'indeterminate' : false)}
              onChange={(enabled) => onChange(enabled ? items.map(({ value }) => value) : [])}
            />
            {items.map(({ value, decoration }, index) => (
              <Choice
                key={value}
                id={`${id}-${index}`}
                label={value}
                decoration={decoration}
                checked={checked.has(value)}
                onChange={(enabled) =>
                  onChange(
                    enabled ? [...selected, value] : selected.filter((item) => item !== value),
                  )
                }
              />
            ))}
          </div>
        ) : null}
        <NewValue onAdd={onAddValue} />
      </PopoverContent>
    </Popover>
  );
}

type ChoiceProps = {
  id: string;
  label: string;
  checked: boolean | 'indeterminate';
  decoration?: ReactNode;
  onChange: (enabled: boolean) => void;
};

function Choice({ id, label, checked, decoration, onChange }: ChoiceProps) {
  return (
    <div className="flex min-h-10 items-center gap-3 rounded-md px-2 hover:bg-surface-muted">
      <Checkbox id={id} checked={checked} onCheckedChange={(next) => onChange(next === true)} />
      <Label
        htmlFor={id}
        className="flex min-h-10 min-w-0 flex-1 cursor-pointer items-center gap-2"
      >
        {decoration}
        <span className="wrap-anywhere">{label}</span>
      </Label>
    </div>
  );
}

function NewValue({ onAdd }: { onAdd: (value: string) => void }) {
  const [value, setValue] = useState('');
  const id = useId();
  const add = () => {
    if (!value.trim()) return;
    onAdd(value.trim());
    setValue('');
  };
  return (
    <div className="space-y-1.5 border-t border-border pt-2">
      <Label htmlFor={id}>Add new value</Label>
      <div className="flex gap-2">
        <Input
          id={id}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
            event.preventDefault();
            add();
          }}
        />
        <Button type="button" variant="secondary" disabled={!value.trim()} onClick={add}>
          Add
        </Button>
      </div>
    </div>
  );
}
