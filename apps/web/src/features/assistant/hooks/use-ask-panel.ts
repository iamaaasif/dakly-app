import { usePathname, useRouter, useSearchParams } from 'next/navigation';

// The open panel lives in the URL, so a link can open it.
export function useAskPanel() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isOpen = searchParams.get('ask') === 'open';
  function setOpen(next: boolean) {
    const query = new URLSearchParams(searchParams);
    if (next) query.set('ask', 'open');
    else query.delete('ask');
    const search = query.toString();
    router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false });
  }
  return [isOpen, setOpen] as const;
}
