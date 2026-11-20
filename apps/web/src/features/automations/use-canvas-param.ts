import { usePathname, useRouter, useSearchParams } from 'next/navigation';

// Canvas state that a link should be able to open, such as the selected step, lives in the URL.
export function useCanvasParam(name: string) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  function change(next: string | null) {
    const query = new URLSearchParams(searchParams);
    if (next) query.set(name, next);
    else query.delete(name);
    const search = query.toString();
    router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false });
  }
  return [searchParams.get(name), change] as const;
}
