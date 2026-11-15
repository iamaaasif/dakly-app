import { Suspense } from 'react';
import { sessionListSchema } from '@dakly/contracts/sessions';
import { requireSession } from '@/lib/require-session';
import { SecurityScreen } from '@/features/security/components/security-screen';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; before?: string }>;
}) {
  await requireSession();
  const query = await searchParams;
  const parsed = sessionListSchema.safeParse({ before: query.before });
  if (!parsed.success)
    return (
      <p role="alert" className="p-6">
        This security page address is invalid. <a href="/security">Open Security</a>.
      </p>
    );
  let tab = query.before ? 'history' : 'profile';
  if (['profile', 'devices', 'two-step', 'history'].includes(query.tab ?? '')) tab = query.tab!;
  return (
    <Suspense fallback={<p>Loading security…</p>}>
      <SecurityScreen tab={tab} before={parsed.data.before} />
    </Suspense>
  );
}
