import type { UseFormReturn } from 'react-hook-form';
import type { ChangeStoreSettingsInput, StoreSettingsResponse } from '@dakly/contracts/stores';
import { FormField } from '@/components/form-field';
const fields = [
  ['name', 'Store name'],
  ['legalName', 'Legal name'],
  ['businessType', 'Business type'],
  ['phone', 'Business mobile number'],
  ['email', 'Business email'],
  ['address', 'Address'],
  ['district', 'District'],
  ['vatBin', 'VAT / BIN'],
  ['tradeLicenceNumber', 'Trade licence number'],
] as const;
export function StoreFields({
  form,
  disabled,
}: {
  form: UseFormReturn<ChangeStoreSettingsInput>;
  disabled: boolean;
}) {
  return (
    <fieldset disabled={disabled} className="grid min-w-0 gap-4 md:grid-cols-2">
      {fields.map(([name, label]) => (
        <FormField
          key={name}
          label={label}
          field={form.register(name, {
            setValueAs: (value) => (name !== 'name' && value === '' ? null : value),
          })}
          error={form.formState.errors[name]}
          type={inputType(name)}
        />
      ))}
    </fieldset>
  );
}
export function storeDefaults(store: StoreSettingsResponse) {
  return Object.fromEntries(fields.map(([name]) => [name, store[name]]));
}
function inputType(name: string) {
  if (name === 'email') return 'email';
  return name === 'phone' ? 'tel' : 'text';
}
