import type { UseFormReturn } from 'react-hook-form';

import type { ChangeStoreSettingsInput, StoreSettingsResponse } from '@dakly/contracts/stores';
import { Card } from '@dakly/ui/card';

import { FormField } from '@/components/form-field';
import { initialsOf } from '@/lib/initials';

type StoreField = {
  name: Exclude<keyof ChangeStoreSettingsInput, 'sending' | 'stock'>;
  label: string;
  type?: 'text' | 'email' | 'tel';
  wide?: boolean;
};

type StoreSection = {
  title: string;
  description: string;
  fields: StoreField[];
};

const emptyAsNull = (value: unknown) => (value === '' ? null : value);

const sections: StoreSection[] = [
  {
    title: 'Store information',
    description: 'Shown on messages, invoices and your Dakly workspace.',
    fields: [
      { name: 'name', label: 'Store name' },
      { name: 'legalName', label: 'Legal name' },
      { name: 'businessType', label: 'Business type' },
      { name: 'phone', label: 'Business mobile number', type: 'tel' },
      { name: 'email', label: 'Business email', type: 'email' },
    ],
  },
  {
    title: 'Address',
    description: 'Used for delivery messages and printed on invoices.',
    fields: [
      { name: 'address', label: 'Address', wide: true },
      { name: 'district', label: 'District' },
    ],
  },
  {
    title: 'Tax and registration',
    description: 'Added to customer receipts and VAT invoices when set.',
    fields: [
      { name: 'vatBin', label: 'VAT / BIN' },
      { name: 'tradeLicenceNumber', label: 'Trade licence number' },
    ],
  },
];

const allFields = sections.flatMap((section) => section.fields);

function StoreLogoHeader({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-4 border-b border-border pb-4">
      <div className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-base font-bold text-text">
        {initialsOf(name)}
      </div>
    </div>
  );
}

export function StoreFields({
  form,
  disabled,
  store,
}: {
  form: UseFormReturn<ChangeStoreSettingsInput>;
  disabled: boolean;
  store: StoreSettingsResponse;
}) {
  return (
    <fieldset disabled={disabled} className="space-y-6">
      {sections.map((section, index) => (
        <Card key={section.title} className="space-y-4">
          <div>
            <h2 className="text-base font-semibold text-text">{section.title}</h2>
            <p className="text-xs text-text-muted">{section.description}</p>
          </div>

          {index === 0 ? <StoreLogoHeader name={store.name} /> : null}

          <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            {section.fields.map(({ name, label, type = 'text', wide }) => (
              <div key={name} className={wide ? 'sm:col-span-2' : undefined}>
                <FormField
                  label={label}
                  field={form.register(
                    name,
                    name === 'name' ? undefined : { setValueAs: emptyAsNull },
                  )}
                  error={form.formState.errors[name]}
                  type={type}
                />
              </div>
            ))}
          </div>
        </Card>
      ))}
    </fieldset>
  );
}

export function storeDefaults(store: StoreSettingsResponse) {
  return Object.fromEntries(allFields.map(({ name }) => [name, store[name]]));
}
