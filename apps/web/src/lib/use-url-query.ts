'use client';
import { useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';

// The server page parses the address for the first paint. Until the address changes, that parsed
// value is right, server-only defaults included. After a change the browser address is the source
// of truth, so a tab or filter change needs no server round trip. Next.js keeps useSearchParams in
// step with history.pushState and history.replaceState.
export function useUrlQuery<Value>(
  initial: Value,
  parse: (raw: Record<string, string>) => Value | undefined,
): Value {
  const text = useSearchParams().toString();
  const [rendered] = useState(text);
  // `parse` is a plain function of the address, so it stays out of the dependencies.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const changed = useMemo(() => parse(Object.fromEntries(new URLSearchParams(text))), [text]);
  return text === rendered ? initial : (changed ?? initial);
}

export function changeUrl(href: string, mode: 'push' | 'replace' = 'push') {
  if (mode === 'push') window.history.pushState(null, '', href);
  else window.history.replaceState(null, '', href);
}

// Same shape as the Next.js router calls these screens used, but with no server round trip.
export function useUrlRouter() {
  return useMemo(
    () => ({
      push: (href: string) => changeUrl(href, 'push'),
      replace: (href: string, _options?: { scroll?: boolean }) => changeUrl(href, 'replace'),
    }),
    [],
  );
}
