'use client';
import { useRouter, useSearchParams } from 'next/navigation';

import type { AuthConfig } from '@/features/auth/auth.types';
import { SignInScreen } from '@/features/auth/components/sign-in-screen';
import { SignUpScreen } from '@/features/auth/components/sign-up-screen';
import { InvitationGate } from '@/features/team/components/invitation-gate';

export function InviteEntry({ config }: { config: AuthConfig }) {
  const query = useSearchParams();
  const router = useRouter();
  const navigate = (view: 'phone' | 'email' | 'signup') =>
    router.replace(`/invites/accept?view=${view}`);
  return (
    <section aria-labelledby="invite-title" className="mx-auto max-w-xl space-y-6 px-4 py-8">
      <h1 id="invite-title" className="text-xl font-bold">
        Join your team
      </h1>
      <InvitationGate
        renderAuth={(done) =>
          query.get('view') === 'signup' ? (
            <SignUpScreen
              config={config}
              onAuthenticated={done}
              onSignIn={() => navigate('phone')}
            />
          ) : (
            <SignInScreen
              config={config}
              method={query.get('view') === 'email' ? 'email' : 'phone'}
              onAuthenticated={done}
              onNavigate={navigate}
            />
          )
        }
      />
    </section>
  );
}
