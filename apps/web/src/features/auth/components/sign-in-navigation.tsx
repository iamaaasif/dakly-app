import { AuthLink } from './auth-link';

export function SignInNavigation({
  method,
  onNavigate,
}: {
  method: 'phone' | 'email';
  onNavigate?: (view: 'phone' | 'email' | 'signup') => void;
}) {
  return (
    <nav aria-label="Sign-in method" className="flex gap-4">
      <AuthLink
        href="/sign-in"
        current={method === 'phone'}
        onNavigate={onNavigate ? () => onNavigate('phone') : undefined}
      >
        Mobile
      </AuthLink>
      <AuthLink
        href="/sign-in?method=email"
        current={method === 'email'}
        onNavigate={onNavigate ? () => onNavigate('email') : undefined}
      >
        Email
      </AuthLink>
    </nav>
  );
}
