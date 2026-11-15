export const dynamic = 'force-dynamic';
import { SignInScreen } from '@/features/auth/components/sign-in-screen';
import { webAuthConfig } from '@/platform/config/env';
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ method?: string }>;
}) {
  const { method } = await searchParams;
  return <SignInScreen config={webAuthConfig()} method={method === 'email' ? 'email' : 'phone'} />;
}
