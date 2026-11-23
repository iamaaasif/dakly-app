import type { GoogleSignInResponse } from '@dakly/contracts/auth';

import type { AuthConfig } from '../auth.types';
import { FacebookSignIn } from './facebook-sign-in';
import { GoogleSignIn } from './google-sign-in';

// Social buttons and the OR divider above the form. Inside an invitation only Google shows.
export function SignInSocial({
  config,
  remember,
  embedded,
  facebookLabel = 'Log in with Facebook',
  googleLabel = 'Log in with Google',
  onResult,
}: {
  config: AuthConfig;
  remember: boolean;
  embedded: boolean;
  facebookLabel?: string;
  googleLabel?: string;
  onResult: (result: GoogleSignInResponse) => void;
}) {
  if (embedded && !config.googleClientId) return null;
  return (
    <>
      <div className="space-y-2.5">
        {config.googleClientId ? (
          <GoogleSignIn
            clientId={config.googleClientId}
            isRemembered={remember}
            termsVersion={config.legal?.termsVersion}
            label={googleLabel}
            onResult={onResult}
          />
        ) : null}
        {embedded ? null : (
          <FacebookSignIn
            label={facebookLabel}
            isRemembered={remember}
            termsVersion={config.legal?.termsVersion}
          />
        )}
      </div>
      <div className="flex items-center gap-3.5 text-xs font-semibold tracking-widest text-text-muted">
        <span className="h-px flex-1 bg-border" />
        OR
        <span className="h-px flex-1 bg-border" />
      </div>
    </>
  );
}
