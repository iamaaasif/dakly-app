import { cn } from '@dakly/ui/cn';

import { authSocialClass } from './auth-control-class';

type FacebookSignInProps = {
  label: string;
  isRemembered: boolean;
  termsVersion?: string;
};
// A plain link: Facebook sign-in is a full-page redirect through the API, so it also works
// before the page has finished loading.
export function FacebookSignIn({ label, isRemembered, termsVersion }: FacebookSignInProps) {
  const query = new URLSearchParams();
  if (termsVersion) query.set('termsVersion', termsVersion);
  if (isRemembered) query.set('remember', '1');
  return (
    <a
      href={`/api/auth/facebook/start${query.size ? `?${query}` : ''}`}
      className={cn(
        authSocialClass,
        'transition-colors hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
      )}
    >
      <span
        aria-hidden="true"
        className="flex size-4.5 items-end justify-center overflow-hidden rounded-full bg-facebook text-sm leading-none font-bold text-on-primary"
      >
        f
      </span>
      {label}
    </a>
  );
}
