import type { FieldError, UseFormRegisterReturn } from 'react-hook-form';

import { Button } from '@dakly/ui/button';

import { FormField } from '@/components/form-field';

type ProofFieldsProps = {
  password: boolean;
  canUsePassword: boolean;
  onMethod: (password: boolean) => void;
  field: UseFormRegisterReturn;
  error?: FieldError;
  onSend: () => void;
  sending: boolean;
  sent: boolean;
};
export function ProofFields({
  password,
  canUsePassword,
  onMethod,
  field,
  error,
  onSend,
  sending,
  sent,
}: ProofFieldsProps) {
  return (
    <div className="space-y-3">
      {canUsePassword ? (
        <Button variant="secondary" onClick={() => onMethod(!password)}>
          {password ? 'Use a verification code instead' : 'Use current password instead'}
        </Button>
      ) : null}
      {password ? (
        <FormField
          label="Current password"
          type="password"
          autoComplete="current-password"
          field={field}
          error={error}
        />
      ) : (
        <>
          <p>Request a fresh code for this action using your verified contact.</p>
          <Button variant="secondary" loading={sending} onClick={onSend}>
            Send proof code
          </Button>
          {sent ? <p role="status">Proof code sent. Check your verified contact.</p> : null}
          <FormField
            label="Proof code"
            type="password"
            inputMode="numeric"
            autoComplete="one-time-code"
            field={field}
            error={error}
          />
        </>
      )}
    </div>
  );
}
