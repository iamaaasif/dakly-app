import { useState } from 'react';

// The server pages by cursor, so the page number comes from the pages this visit has seen.
export function usePageTrail(cursor: number | undefined, go: (cursor: number | undefined) => void) {
  const [trail, setTrail] = useState<(number | undefined)[]>(
    cursor ? [undefined, cursor] : [undefined],
  );
  const index = Math.max(trail.indexOf(cursor), 0);
  return {
    page: index + 1,
    next: (next: number) => {
      setTrail([...trail.slice(0, index + 1), next]);
      go(next);
    },
    previous: () => go(trail[index - 1]),
  };
}
