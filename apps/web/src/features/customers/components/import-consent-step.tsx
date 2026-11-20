import { useFormContext } from 'react-hook-form';

import type { StartImportInput } from '@dakly/contracts/contacts';
import { ApiError } from '@dakly/ui/api-client';
import { FormField } from '@dakly/ui/form-field';
import { Input } from '@dakly/ui/input';

import { ImportStepActions } from './import-step-actions';

const blankToUndefined = (value: string) => value.trim() || undefined;

type ImportConsentStepProps = {
  rowCount: number;
  error: Error | null;
  loading: boolean;
  onBack: () => void;
};

export function ImportConsentStep({ rowCount, error, loading, onBack }: ImportConsentStepProps) {
  const { register } = useFormContext<StartImportInput>();
  return (
    <div className="space-y-4">
      <p className="text-sm text-text-muted">
        If these customers agreed to hear from your shop, write where they agreed, such as
        &quot;Shopify checkout, Sep 2026&quot;. Leave a channel empty if they did not agree: they
        get no marketing messages on it.
      </p>
      <FormField name="consentEvidence.whatsapp" label="WhatsApp: where did they agree?" optional>
        {(control) => (
          <Input
            {...control}
            {...register('consentEvidence.whatsapp', { setValueAs: blankToUndefined })}
          />
        )}
      </FormField>
      <FormField name="consentEvidence.sms" label="SMS: where did they agree?" optional>
        {(control) => (
          <Input
            {...control}
            {...register('consentEvidence.sms', { setValueAs: blankToUndefined })}
          />
        )}
      </FormField>
      <p className="text-sm text-text-muted">{rowCount} rows in this file.</p>
      {error ? (
        <p role="alert" className="text-danger">
          {error instanceof ApiError ? error.message : 'The import did not start. Try again.'}
        </p>
      ) : null}
      <ImportStepActions onBack={onBack} next="Start import" loading={loading} />
    </div>
  );
}
