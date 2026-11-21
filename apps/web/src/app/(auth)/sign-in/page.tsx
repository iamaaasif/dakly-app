import { SignInScreen } from '@/features/auth/components/sign-in-screen';
import { redirectIfSignedIn } from '@/lib/redirect-if-signed-in';
import { webAuthConfig } from '@/platform/config/env';

export const dynamic = 'force-dynamic';
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ method?: string }>;
}) {
  await redirectIfSignedIn();
  const { method } = await searchParams;
  return <SignInScreen config={webAuthConfig()} method={method === 'email' ? 'email' : 'phone'} />;
}
