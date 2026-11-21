import type { AuthConfig } from '../auth.types';

export function GoogleConsentNote({ legal }: { legal: NonNullable<AuthConfig['legal']> }) {
  return (
    <p className="text-sm text-text-muted">
      New to Dakly? Continuing with Google creates your account and means you agree to the{' '}
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
