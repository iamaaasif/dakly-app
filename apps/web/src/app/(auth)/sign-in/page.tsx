import { SignInScreen } from '@/features/auth/components/sign-in-screen';
import { redirectIfSignedIn } from '@/lib/redirect-if-signed-in';
import { safeNextPath } from '@/lib/safe-next-path';
import { webAuthConfig } from '@/platform/config/env';

export const dynamic = 'force-dynamic';
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ method?: string; next?: string }>;
}) {
  const { method, next } = await searchParams;
  await redirectIfSignedIn(next);
  return (
    <SignInScreen
      config={webAuthConfig()}
      method={method === 'phone' ? 'phone' : 'email'}
      next={safeNextPath(next)}
    />
  );
}
