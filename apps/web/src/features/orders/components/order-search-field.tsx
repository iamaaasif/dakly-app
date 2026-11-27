import { Search, X } from 'lucide-react';
import { useEffect, useRef, type ChangeEvent, type FormEvent } from 'react';

import { Input } from '@dakly/ui/input';
import { Label } from '@dakly/ui/label';

import type { OrdersNavigationQuery } from '../orders-url';

const searchDelayMs = 300;

type OrderSearchFieldProps = {
  search?: string;
  onSearch: (change: Pick<OrdersNavigationQuery, 'search'>, mode?: 'push' | 'replace') => void;
};

// Typing searches after a short pause and replaces the address, so Back skips the keystrokes.
// Enter searches at once.
export function OrderSearchField({ search, onSearch }: OrderSearchFieldProps) {
  const input = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Back and Forward change the address under a field the person is not typing in.
  useEffect(() => {
    const field = input.current;
    if (field && document.activeElement !== field) field.value = search ?? '';
  }, [search]);
  useEffect(() => () => clearTimeout(timer.current), []);

  function type(event: ChangeEvent<HTMLInputElement>) {
    const typed = event.target.value.trim() || undefined;
    clearTimeout(timer.current);
    if (typed !== search)
      timer.current = setTimeout(() => onSearch({ search: typed }, 'replace'), searchDelayMs);
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearTimeout(timer.current);
    onSearch({ search: input.current?.value.trim() || undefined });
  }
  function clear() {
    clearTimeout(timer.current);
    if (input.current) input.current.value = '';
    onSearch({ search: undefined });
    input.current?.focus();
  }

  return (
    <form role="search" onSubmit={submit} className="relative w-full min-w-0 sm:max-w-80 sm:flex-1">
      <Label htmlFor="order-search" className="sr-only">
        Search orders
      </Label>
      <Search
        aria-hidden="true"
        size={16}
        strokeWidth={2}
        className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-muted"
      />
      <Input
        ref={input}
        id="order-search"
        type="search"
        maxLength={120}
        placeholder="Search name or code"
        defaultValue={search}
        onChange={type}
        className="pr-9 pl-9 [&::-webkit-search-cancel-button]:hidden"
      />
      {search ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={clear}
          className="absolute top-1/2 right-1 grid size-8 -translate-y-1/2 place-items-center rounded-md text-text-muted hover:text-text focus-visible:outline-2 focus-visible:outline-focus"
        >
          <X aria-hidden="true" size={14} strokeWidth={2} />
        </button>
      ) : null}
    </form>
  );
}
