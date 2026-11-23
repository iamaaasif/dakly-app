import type { AuthConfig } from '../auth.types';

// Names only the buttons the page shows, so the note never mentions one that is missing.
export function SocialConsentNote({
  legal,
  providers,
}: {
  legal: NonNullable<AuthConfig['legal']>;
  providers: string;
}) {
  return (
    <p className="text-sm text-text-muted">
      New to Dakly? Continuing with {providers} creates your account and means you agree to the{' '}
      <a href={legal.termsUrl} target="_blank" rel="noopener noreferrer" className="underline">
        Terms
      </a>{' '}
      and{' '}
      <a href={legal.privacyUrl} target="_blank" rel="noopener noreferrer" className="underline">
        Privacy
      </a>{' '}
      documents.
    </p>
  );
}
