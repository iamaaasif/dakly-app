import { useFormContext } from 'react-hook-form';
import type { AuthConfig } from '../auth.types';
export function SignUpConsent({ legal }: { legal: NonNullable<AuthConfig['legal']> }) {
  const form = useFormContext<{ consent: boolean }>();
  const errors = form.formState.errors;
  return (
    <>
      <label className="flex min-h-10 items-center gap-3">
        <input
          type="checkbox"
          {...form.register('consent')}
          aria-invalid={Boolean(errors.consent)}
        />
        I agree to the Terms and Privacy documents.
      </label>
      <div className="flex gap-4">
        <a
          href={legal.termsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-10 items-center text-action underline"
        >
          Terms
        </a>
        <a
          href={legal.privacyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-10 items-center text-action underline"
        >
          Privacy
        </a>
      </div>
      {errors.consent ? (
        <p role="alert" className="text-danger">
          {errors.consent.message}
        </p>
      ) : null}
    </>
  );
}
