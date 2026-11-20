import { Skeleton } from '@dakly/ui/skeleton';

export default function LoadingContentStudio() {
  return (
    <main role="status" className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <span className="sr-only">Loading Content Studio</span>
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-96 w-full" />
    </main>
  );
}
