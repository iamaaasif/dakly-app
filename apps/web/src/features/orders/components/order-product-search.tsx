'use client';
import { Search } from 'lucide-react';
import { useId, useMemo, useState, type KeyboardEvent } from 'react';

import { lineFromVariant, type OrderLine } from '../new-order-lines';
import {
  choicesOf,
  optionId,
  ResultList,
  type Choice,
  type ResultStatus,
} from './order-product-results';
import { useOrderCatalogue, useRecentOrderProducts } from '@/lib/order-entry/order-catalogue';
import { useDebouncedValue } from '@/lib/use-debounced-value';

const searchInputClass =
  'min-h-10 w-full min-w-0 rounded-md border border-input-border bg-surface py-2 pr-3 pl-9 text-base text-text placeholder:text-text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus';

function useProductChoices(term: string) {
  const debounced = useDebouncedValue(term.trim(), 250);
  const typed = term.trim().length >= 2 ? debounced : '';
  const searching = typed.length >= 2;
  const found = useOrderCatalogue(searching ? typed : undefined, searching);
  const recent = useRecentOrderProducts();
  const source = searching ? found : recent;
  const products = useMemo(
    () =>
      searching ? (found.data?.pages.flatMap(({ items }) => items) ?? []) : (recent.data ?? []),
    [searching, found.data, recent.data],
  );
  const choices = useMemo(() => choicesOf(products), [products]);
  let status: ResultStatus = 'ready';
  if (source.isPending) status = 'loading';
  else if (source.error) status = 'error';
  return { typed, searching, products, choices, status };
}

function useProductSearch(onPick: (line: OrderLine) => void) {
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const found = useProductChoices(term);
  const { choices } = found;

  function pick(choice: Choice | undefined) {
    const line = choice && lineFromVariant(choice.product, choice.variantId);
    if (!choice || choice.disabled || !line) return;
    onPick(line);
    setTerm('');
    setActive(0);
  }
  function move(step: 1 | -1) {
    const enabled = choices.flatMap((choice, index) => (choice.disabled ? [] : [index]));
    if (!enabled.length) return;
    const next = (enabled.indexOf(active) + step + enabled.length) % enabled.length;
    setActive(enabled[next] ?? 0);
  }
  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      move(event.key === 'ArrowDown' ? 1 : -1);
    } else if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      pick(choices[active]);
    } else if (event.key === 'Escape' && open) {
      event.stopPropagation();
      setOpen(false);
    }
  }
  function onChange(value: string) {
    setTerm(value);
    setActive(0);
    setOpen(true);
  }
  return { ...found, term, open, active, setOpen, setActive, pick, onKeyDown, onChange };
}

export function OrderProductSearch({ onPick }: { onPick: (line: OrderLine) => void }) {
  const listId = useId();
  const box = useProductSearch(onPick);
  const activeChoice = box.choices[box.active];
  return (
    <div className="relative">
      <Search
        aria-hidden="true"
        size={16}
        strokeWidth={1.75}
        className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-muted"
      />
      <input
        role="combobox"
        aria-label="Add products"
        aria-expanded={box.open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          box.open && activeChoice ? optionId(listId, activeChoice) : undefined
        }
        autoComplete="off"
        placeholder="Add products"
        maxLength={200}
        value={box.term}
        onChange={(event) => box.onChange(event.target.value)}
        onFocus={() => box.setOpen(true)}
        onBlur={() => box.setOpen(false)}
        onKeyDown={box.onKeyDown}
        className={searchInputClass}
      />
      {box.open && (
        <div
          id={listId}
          role="listbox"
          aria-label={box.searching ? 'Matching products' : 'Recently sold products'}
          // Keeps focus in the box so a click on a row does not close the list first.
          onMouseDown={(event) => event.preventDefault()}
          className="motion-popover absolute inset-x-0 top-full z-20 mt-1 max-h-96 overflow-y-auto rounded-lg border border-border bg-surface shadow-overlay"
          data-state="open"
        >
          <ResultList
            listId={listId}
            products={box.products}
            choices={box.choices}
            active={box.active}
            searching={box.searching}
            status={box.status}
            term={box.typed}
            onActive={box.setActive}
            onPick={box.pick}
          />
        </div>
      )}
    </div>
  );
}
