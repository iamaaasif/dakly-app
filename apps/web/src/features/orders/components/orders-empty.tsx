import { Inbox, SearchX } from 'lucide-react';

import { UrlLink } from '@/components/url-link';

type OrdersEmptyProps = { title: string; hint: string; clearHref?: string };

export function OrdersEmpty({ title, hint, clearHref }: OrdersEmptyProps) {
  const Icon = clearHref ? SearchX : Inbox;
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-16 text-center md:py-20">
      <Icon aria-hidden="true" size={48} strokeWidth={1.25} className="text-text-subtle" />
      <p className="mt-1 font-semibold text-text">{title}</p>
      <p className="max-w-sm text-sm text-text-muted">{hint}</p>
      {clearHref ? (
        <UrlLink
          href={clearHref}
          className="inline-flex min-h-10 items-center text-sm font-medium text-action underline"
        >
          Clear search and filters
        </UrlLink>
      ) : null}
    </div>
  );
}
