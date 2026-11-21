import { SignUpScreen } from '@/features/auth/components/sign-up-screen';
import { redirectIfSignedIn } from '@/lib/redirect-if-signed-in';
import { webAuthConfig } from '@/platform/config/env';

export const dynamic = 'force-dynamic';
export default async function SignUpPage() {
  await redirectIfSignedIn();
  return <SignUpScreen config={webAuthConfig()} />;
}
