'use client';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

import type { SocialAccount } from './api/get-social-accounts';
import { dhakaDayKey } from '@/lib/format-date';

export type CalendarView = 'month' | 'week' | 'list';

const calendarViews: readonly string[] = ['month', 'week', 'list'];

function defaultView(): CalendarView {
  // Month is too small to read on a phone, so a phone starts on List.
  const phone = typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
  return phone ? 'list' : 'month';
}

// The view, day and account live in the URL so a link or reload shows the same screen.
export function useMyPostsParams(accounts: SocialAccount[]) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [today] = useState(() => dhakaDayKey(new Date()));
  const view = params.get('view') ?? '';
  const date = params.get('date') ?? '';
  const account = params.get('account');
  return {
    today,
    view: calendarViews.includes(view) ? (view as CalendarView) : defaultView(),
    date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today,
    accountId: accounts.some(({ id }) => id === account) ? account : null,
    setParams: (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(changes))
        if (value === null) next.delete(key);
        else next.set(key, value);
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
  };
}
