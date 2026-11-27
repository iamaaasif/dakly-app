import { useEffect, useRef } from 'react';

const searchDelayMs = 250;
// The server needs three letters, so shorter text waits for Enter.
const minimumLetters = 3;

// Typing searches 250 ms after the last key. Emptying the box shows everything again at once.
// `committed` is the term the address holds now; `apply` writes a new one to the address.
export function useSearchAsYouType(
  typed: string | undefined,
  committed: string | undefined,
  apply: (search: string | undefined) => void,
) {
  const latest = useRef({ committed, apply });
  latest.current = { committed, apply };
  // Only typing runs this. When Back changes the address, the box follows it and must not search again.
  useEffect(() => {
    const search = typed?.trim() || undefined;
    if (search === latest.current.committed) return;
    if (!search) {
      latest.current.apply(undefined);
      return;
    }
    if (search.length < minimumLetters) return;
    const timer = setTimeout(() => latest.current.apply(search), searchDelayMs);
    return () => clearTimeout(timer);
  }, [typed]);
}
