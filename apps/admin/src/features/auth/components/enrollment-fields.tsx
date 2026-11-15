import type { UseFormReturn } from 'react-hook-form';
import type { StaffEnrollmentInput } from '@dakly/contracts/staff-auth';
import { Input } from '@dakly/ui/input';
type EnrollmentFieldsProps = { form: UseFormReturn<StaffEnrollmentInput> };
export function EnrollmentFields({ form }: EnrollmentFieldsProps) {
  return (
    <>
      <label className="grid gap-2 font-medium">
        Setup proof
        <Input
          {...form.register('proof')}
          type="password"
          autoComplete="off"
          aria-invalid={Boolean(form.formState.errors.proof)}
          aria-describedby="proof-error"
        />
      </label>
      <p id="proof-error" role="alert" className="text-danger">
        {form.formState.errors.proof ? 'Enter the setup proof from your operator.' : null}
      </p>
      <label className="grid gap-2 font-medium">
        New password
        <Input
          {...form.register('password')}
          type="password"
          autoComplete="new-password"
          aria-invalid={Boolean(form.formState.errors.password)}
          aria-describedby="new-password-hint"
        />
      </label>
      <p id="new-password-hint" className="text-muted text-sm">
        Use at least eight characters, including a number.
      </p>
      {form.formState.errors.password ? (
        <p role="alert" className="text-danger">
          Choose a password that meets the requirements.
        </p>
      ) : null}
      <fieldset className="space-y-3">
        <legend className="mb-2 font-medium">Verification method</legend>
        <label className="flex min-h-10 items-center gap-3">
          <input type="radio" value="passkey" {...form.register('factor')} />
          Passkey
        </label>
        <label className="flex min-h-10 items-center gap-3">
          <input type="radio" value="totp" {...form.register('factor')} />
          Authenticator app
        </label>
      </fieldset>
    </>
  );
}
