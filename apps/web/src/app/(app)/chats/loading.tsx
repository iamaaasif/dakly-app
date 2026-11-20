import { Skeleton } from '@dakly/ui/skeleton';

export default function ChatsLoading() {
  return (
    <main aria-busy="true" className="space-y-4 p-4 md:p-8">
      <p className="sr-only">Loading chats</p>
      <Skeleton className="h-10 w-48" />
      <Skeleton className="h-96 w-full" />
    </main>
  );
}
