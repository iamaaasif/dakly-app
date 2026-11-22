import { UrlLink } from '@/components/url-link';

export function TeamPagination({
  path,
  cursor,
  nextCursor,
}: {
  path: string;
  cursor?: string;
  nextCursor: string | null;
}) {
  const separator = path.includes('?') ? '&' : '?';
  return (
    <nav aria-label="Team pages" className="flex gap-4">
      {cursor ? (
        <UrlLink className="inline-flex min-h-10 items-center text-action underline" href={path}>
          First page
        </UrlLink>
      ) : null}
      {nextCursor ? (
        <UrlLink
          className="inline-flex min-h-10 items-center text-action underline"
          href={`${path}${separator}cursor=${encodeURIComponent(nextCursor)}`}
        >
          Next page
        </UrlLink>
      ) : null}
    </nav>
  );
}
