export const dynamic = 'force-dynamic';
import { SignUpScreen } from '@/features/auth/components/sign-up-screen';
import { webAuthConfig } from '@/platform/config/env';
export default function SignUpPage() {
  return <SignUpScreen config={webAuthConfig()} />;
}
