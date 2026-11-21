import { AuthLink } from './auth-link';

type Method = 'phone' | 'email';
export function SignInNavigation({
  method,
  next,
  onNavigate,
}: {
  method: Method;
  next?: string;
  onNavigate?: (view: Method | 'signup') => void;
}) {
  const query = (method: Method) => {
    const params = new URLSearchParams();
    if (method === 'email') params.set('method', 'email');
    if (next) params.set('next', next);
    return params.size ? `/sign-in?${params}` : '/sign-in';
  };
  const tabs: { view: Method; href: string; label: string }[] = [
    { view: 'phone', href: query('phone'), label: 'Mobile number' },
    { view: 'email', href: query('email'), label: 'Email' },
  ];
  return (
    <nav
      aria-label="Sign-in method"
      className="inline-flex gap-1 rounded-lg border border-border bg-surface-muted p-1"
    >
      {tabs.map(({ view, href, label }) => (
        <AuthLink
          key={view}
          href={href}
          current={method === view}
          onNavigate={onNavigate ? () => onNavigate(view) : undefined}
          className={`rounded-md px-3 no-underline ${
            method === view
              ? 'border border-border bg-surface font-semibold text-text'
              : 'text-text'
          }`}
        >
          {label}
        </AuthLink>
      ))}
    </nav>
  );
}
