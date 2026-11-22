'use client';
import Link from 'next/link';
import type { ComponentProps, MouseEvent } from 'react';

import { changeUrl } from '@/lib/use-url-query';

type UrlLinkProps = Omit<ComponentProps<typeof Link>, 'href' | 'prefetch'> & { href: string };

// A link to another view of the same screen. The screen reads its filters from the address, so the
// address changes in the browser at once and the list comes from the cache. Modified clicks keep
// their normal meaning, such as open in a new tab.
export function UrlLink({ href, onClick, ...rest }: UrlLinkProps) {
  function follow(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (rest.target && rest.target !== '_self') return;
    event.preventDefault();
    changeUrl(href);
  }
  return <Link {...rest} href={href} prefetch={false} onClick={follow} />;
}
