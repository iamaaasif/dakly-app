import { Upload } from 'lucide-react';
import type { UseFormReturn } from 'react-hook-form';

import type { ChangeStoreSettingsInput, StoreSettingsResponse } from '@dakly/contracts/stores';
import { Button } from '@dakly/ui/button';
import { Card } from '@dakly/ui/card';

import { FormField } from '@/components/form-field';
import { initialsOf } from '@/lib/initials';

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

function StoreLogoHeader({ name }: { name?: string | null }) {
  return (
    <div className="flex items-center gap-4 border-b border-border pb-4">
      <div className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-base font-bold text-text">
        {initialsOf(name ?? 'UT')}
      </div>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Button variant="secondary" type="button" disabled className="h-8 min-h-8 text-xs">
            <Upload className="size-3.5" aria-hidden="true" />
            Upload logo
          </Button>
          <button
            type="button"
            disabled
            className="text-xs font-medium text-danger hover:underline disabled:opacity-50"
          >
            Remove
          </button>
        </div>
        <p className="text-xs text-text-muted">Square PNG, at least 256 × 256.</p>
      </div>
    </div>
  );
}

function StoreInfoCard({
  form,
  store,
}: {
  form: UseFormReturn<ChangeStoreSettingsInput>;
  store?: StoreSettingsResponse;
}) {
  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-text">Store information</h2>
        <p className="text-xs text-text-muted">
          Shown on messages, invoices and your Dakly workspace.
        </p>
      </div>

      <StoreLogoHeader name={store?.name} />

      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <FormField
          label="Store name"
          field={form.register('name')}
          error={form.formState.errors.name}
          type="text"
        />
        <FormField
          label="Legal name"
          field={form.register('legalName', {
            setValueAs: (v) => (v === '' ? null : v),
          })}
          error={form.formState.errors.legalName}
          type="text"
        />
        <FormField
          label="Business type"
          field={form.register('businessType', {
            setValueAs: (v) => (v === '' ? null : v),
          })}
          error={form.formState.errors.businessType}
          type="text"
        />
        <FormField
          label="Business mobile number"
          field={form.register('phone', {
            setValueAs: (v) => (v === '' ? null : v),
          })}
          error={form.formState.errors.phone}
          type="tel"
        />
        <FormField
          label="Business email"
          field={form.register('email', {
            setValueAs: (v) => (v === '' ? null : v),
          })}
          error={form.formState.errors.email}
          type="email"
        />
      </div>
    </Card>
  );
}

function StoreAddressCard({ form }: { form: UseFormReturn<ChangeStoreSettingsInput> }) {
  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-text">Address</h2>
        <p className="text-xs text-text-muted">
          Used for delivery messages and printed on invoices.
        </p>
      </div>
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <FormField
            label="Address"
            field={form.register('address', {
              setValueAs: (v) => (v === '' ? null : v),
            })}
            error={form.formState.errors.address}
            type="text"
          />
        </div>
        <FormField
          label="District"
          field={form.register('district', {
            setValueAs: (v) => (v === '' ? null : v),
          })}
          error={form.formState.errors.district}
          type="text"
        />
      </div>
    </Card>
  );
}

function StoreTaxCard({ form }: { form: UseFormReturn<ChangeStoreSettingsInput> }) {
  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-text">Tax and registration</h2>
        <p className="text-xs text-text-muted">
          Added to customer receipts and VAT invoices when set.
        </p>
      </div>
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <FormField
          label="VAT / BIN"
          field={form.register('vatBin', {
            setValueAs: (v) => (v === '' ? null : v),
          })}
          error={form.formState.errors.vatBin}
          type="text"
        />
        <FormField
          label="Trade licence number"
          field={form.register('tradeLicenceNumber', {
            setValueAs: (v) => (v === '' ? null : v),
          })}
          error={form.formState.errors.tradeLicenceNumber}
          type="text"
        />
      </div>
    </Card>
  );
}

export function StoreFields({
  form,
  disabled,
  store,
}: {
  form: UseFormReturn<ChangeStoreSettingsInput>;
  disabled: boolean;
  store?: StoreSettingsResponse;
}) {
  return (
    <fieldset disabled={disabled} className="space-y-6">
      <StoreInfoCard form={form} store={store} />
      <StoreAddressCard form={form} />
      <StoreTaxCard form={form} />
    </fieldset>
  );
}

export function storeDefaults(store: StoreSettingsResponse) {
  return Object.fromEntries(fields.map(([name]) => [name, store[name]]));
}
