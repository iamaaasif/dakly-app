'use client';
import { useSearchParams } from 'next/navigation';
import { useMemo, useState, useSyncExternalStore } from 'react';

// The server page parses the address for the first paint. Until the address changes, that parsed
// value is right, server-only defaults included. After a change the browser address is the source
// of truth, so a tab or filter change needs no server round trip. The address is read from the
// browser and not from the Next.js router, so Back and Forward update it at once too.
const urlChanged = 'dakly:urlchange';
// Once the address has changed in the browser, the props from the last server render may be for
// an older address, such as after a shop switch remounts the screen, so they are no longer used.
let changedInBrowser = false;

function subscribe(onChange: () => void) {
  const markChanged = () => {
    changedInBrowser = true;
  };
  window.addEventListener('popstate', markChanged);
  window.addEventListener('popstate', onChange);
  window.addEventListener(urlChanged, onChange);
  return () => {
    window.removeEventListener('popstate', markChanged);
    window.removeEventListener('popstate', onChange);
    window.removeEventListener(urlChanged, onChange);
  };
}

export function useUrlQuery<Value>(
  initial: Value,
  parse: (raw: Record<string, string>) => Value | undefined,
): Value {
  const renderedText = useSearchParams().toString();
  const text = useSyncExternalStore(
    subscribe,
    () => new URLSearchParams(window.location.search).toString(),
    () => renderedText,
  );
  const [rendered] = useState(renderedText);
  // `parse` is a plain function of the address, so it stays out of the dependencies.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const changed = useMemo(() => parse(Object.fromEntries(new URLSearchParams(text))), [text]);
  return text === rendered && !changedInBrowser ? initial : (changed ?? initial);
}

export function changeUrl(href: string, mode: 'push' | 'replace' = 'push') {
  if (mode === 'push') window.history.pushState(null, '', href);
  else window.history.replaceState(null, '', href);
  changedInBrowser = true;
  window.dispatchEvent(new Event(urlChanged));
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
