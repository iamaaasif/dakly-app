'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

// Asks before a link or a reload throws away typing. A link click is held, the member chooses,
// and the same address then opens.
export function useLeaveGuard(dirty: boolean) {
  const router = useRouter();
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    if (!dirty) return;
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    function handleClick(event: MouseEvent) {
      const next = heldLinkTarget(event);
      if (next === null) return;
      event.preventDefault();
      event.stopPropagation();
      setTarget(next);
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('click', handleClick, true);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('click', handleClick, true);
    };
  }, [dirty]);

  return {
    leaving: target !== null,
    keepEditing: () => setTarget(null),
    discard: () => {
      const next = target;
      setTarget(null);
      if (next) router.push(next);
    },
  };
}

function isPlainLeftClick(event: MouseEvent) {
  const modified = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
  return !event.defaultPrevented && event.button === 0 && !modified;
}

// The address of a plain left click on a link to another page of this site, otherwise null.
function heldLinkTarget(event: MouseEvent): string | null {
  const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
  if (!isPlainLeftClick(event) || !(link instanceof HTMLAnchorElement)) return null;
  const url = new URL(link.href, window.location.href);
  const here = window.location.pathname + window.location.search;
  const elsewhere = url.origin === window.location.origin && url.pathname + url.search !== here;
  return elsewhere && link.target !== '_blank' ? url.pathname + url.search + url.hash : null;
}
