import Link from 'next/link';

import { chatScreenQuerySchema } from '@/features/chats/chat-filters';
import { ChatsScreen } from '@/features/chats/components/chats-screen';
import { requireSession } from '@/lib/require-session';

export default async function ChatsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; channel?: string }>;
}) {
  const session = await requireSession();
  if (!session.currentStore?.canViewChats)
    return (
      <p role="status" className="p-6">
        You do not have Chats access in this shop.
      </p>
    );
  const parsed = chatScreenQuerySchema.safeParse(await searchParams);
  if (!parsed.success)
    return (
      <p role="alert" className="p-6">
        This chats address is invalid. <Link href="/chats">Open all chats</Link>.
      </p>
    );
  return <ChatsScreen query={parsed.data} />;
}
