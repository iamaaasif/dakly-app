'use client';
import { useId, useState, type KeyboardEvent } from 'react';

import type { AreaSearchResult } from '@dakly/contracts/delivery';
import { cn } from '@dakly/ui/cn';
import { Label } from '@dakly/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@dakly/ui/select';

import { filledClass } from '../new-order-fields';
import { useAreaSearch, useDistricts } from '@/lib/order-entry/search-areas';
import { useDebouncedValue } from '@/lib/use-debounced-value';

type OrderAreaPickerProps = {
  area: AreaSearchResult | null;
  filled: boolean;
  invalid: boolean;
  onChange: (area: AreaSearchResult | null) => void;
};

const arrowSteps: Record<string, number> = { ArrowDown: 1, ArrowUp: -1 };
const label = ({ name, districtName, kind }: AreaSearchResult) =>
  kind === 'district' ? name : `${name}, ${districtName}`;

// City is the whole district. Area narrows it to an upazila, and picking one sets its city too.
export function OrderAreaPicker({ area, filled, invalid, onChange }: OrderAreaPickerProps) {
  const districts = useDistricts();
  const cityId = area ? String(area.districtId) : '';
  return (
    <>
      <div className="space-y-1.5">
        <Label>Area</Label>
        <AreaCombobox area={area} filled={filled} invalid={invalid} onChange={onChange} />
      </div>
      <div className="space-y-1.5">
        <Label>City</Label>
        <Select
          value={cityId}
          onValueChange={(value) => {
            const district = districts.data?.items.find(({ id }) => String(id) === value);
            if (district)
              onChange({ ...district, districtId: district.id, districtName: district.name });
          }}
        >
          <SelectTrigger
            aria-label="City"
            aria-invalid={invalid && !area}
            className={cn(filled && filledClass)}
          >
            <SelectValue placeholder="Choose a city" />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {districts.data?.items.map(({ id, name }) => (
              <SelectItem key={id} value={String(id)}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </>
  );
}

function useAreaCombobox({ area, onChange }: Pick<OrderAreaPickerProps, 'area' | 'onChange'>) {
  const [term, setTerm] = useState<string | undefined>();
  const [active, setActive] = useState(0);
  const typed = useDebouncedValue((term ?? '').trim(), 250);
  const search = useAreaSearch(typed);
  const open = term !== undefined && term.trim().length >= 2;
  const results = open ? (search.data?.items ?? []) : [];
  const stored = area && area.kind !== 'district' ? label(area) : '';

  function pick(result: AreaSearchResult | undefined) {
    if (!result) return;
    onChange(result);
    setTerm(undefined);
  }
  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const arrow = arrowSteps[event.key] ?? 0;
    if (arrow) {
      event.preventDefault();
      setActive((now) => (results.length ? (now + arrow + results.length) % results.length : 0));
    } else if (event.key === 'Enter' && open && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      pick(results[active]);
    } else if (event.key === 'Escape' && term !== undefined) {
      event.stopPropagation();
      setTerm(undefined);
    }
  }
  return {
    open,
    active,
    results,
    typed,
    searching: search.isFetching,
    shown: term ?? stored,
    pick,
    onKeyDown,
    onChange: (value: string) => {
      setTerm(value);
      setActive(0);
    },
    close: () => setTerm(undefined),
    hover: setActive,
  };
}

function AreaCombobox({ area, filled, invalid, onChange }: OrderAreaPickerProps) {
  const listId = useId();
  const box = useAreaCombobox({ area, onChange });
  const current = box.results[box.active];
  return (
    <div className="relative">
      <input
        role="combobox"
        aria-label="Area"
        aria-expanded={box.open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-invalid={invalid && !area}
        aria-activedescendant={box.open && current ? `${listId}-${current.id}` : undefined}
        autoComplete="off"
        placeholder="e.g. Mirpur 10"
        value={box.shown}
        onChange={(event) => box.onChange(event.target.value)}
        onBlur={box.close}
        onKeyDown={box.onKeyDown}
        className={cn(
          'min-h-10 w-full min-w-0 rounded-md border border-input-border bg-surface px-3 py-2 text-base text-text placeholder:text-text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus aria-invalid:border-danger',
          filled && filledClass,
        )}
      />
      {box.open && <AreaOptions id={listId} box={box} />}
    </div>
  );
}

function AreaOptions({ id, box }: { id: string; box: ReturnType<typeof useAreaCombobox> }) {
  return (
    <ul
      id={id}
      role="listbox"
      aria-label="Matching areas"
      onMouseDown={(event) => event.preventDefault()}
      className="motion-popover absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-lg border border-border bg-surface p-1 shadow-overlay"
      data-state="open"
    >
      {box.results.length === 0 && (
        <li className="px-3 py-2 text-text-muted">
          {box.searching ? 'Searching…' : `No area matches “${box.typed}”`}
        </li>
      )}
      {box.results.map((result, index) => (
        <li
          key={result.id}
          id={`${id}-${result.id}`}
          role="option"
          aria-selected={index === box.active}
          onMouseMove={() => box.hover(index)}
          onClick={() => box.pick(result)}
          className={cn(
            'cursor-pointer rounded-md px-3 py-2',
            index === box.active && 'bg-surface-hover',
          )}
        >
          {label(result)}
        </li>
      ))}
    </ul>
  );
}
