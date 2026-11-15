import Link from 'next/link';

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
        <Link className="inline-flex min-h-10 items-center text-action underline" href={path}>
          First page
        </Link>
      ) : null}
      {nextCursor ? (
        <Link
          className="inline-flex min-h-10 items-center text-action underline"
          href={`${path}${separator}cursor=${encodeURIComponent(nextCursor)}`}
        >
          Next page
        </Link>
      ) : null}
    </nav>
  );
}
