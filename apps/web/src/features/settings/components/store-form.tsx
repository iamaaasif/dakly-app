import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import {
  changeStoreSettingsSchema,
  type ChangeStoreSettingsInput,
  type StoreSettingsResponse,
} from '@dakly/contracts/stores';
import { Button } from '@dakly/ui/button';

import { useChangeSettings } from '../api/change-settings';
import { StoreFields, storeDefaults } from './store-fields';
import { formError } from '@/lib/form-error';

export function StoreForm({
  store,
  editable,
}: {
  store: StoreSettingsResponse;
  editable: boolean;
}) {
  const [saved, setSaved] = useState(false);
  const form = useForm<ChangeStoreSettingsInput>({
    resolver: zodResolver(changeStoreSettingsSchema),
    defaultValues: storeDefaults(store),
  });
  const change = useChangeSettings();
  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit(async (values) => {
        const patch = Object.fromEntries(
          Object.entries(values).filter(
            ([name]) => form.formState.dirtyFields[name as keyof ChangeStoreSettingsInput],
          ),
        );
        if (!Object.keys(patch).length) return;
        try {
          const result = await change.mutateAsync(patch);
          form.reset(storeDefaults(result));
          setSaved(true);
        } catch (error) {
          formError(error, form.setError);
        }
      })}
    >
      <p className="text-sm text-text-muted">
        Business contact details appear here independently of your account contacts. Clear an
        optional field to remove it.
      </p>
      <StoreFields form={form} disabled={!editable || change.isPending} store={store} />
      {form.formState.errors.root ? (
        <p role="alert" className="text-danger">
          {form.formState.errors.root.message}
        </p>
      ) : null}
      {saved ? <p role="status">Store information saved.</p> : null}
      {editable ? (
        <Button type="submit" loading={change.isPending} disabled={!form.formState.isDirty}>
          Save store information
        </Button>
      ) : (
        <p>You can view these settings.</p>
      )}
    </form>
  );
}
