import { ExtensionChoices, extensionSelection } from './extension-choices';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  changeStoreExtensionsSchema,
  type ChangeStoreExtensionsInput,
  type StoreSettingsResponse,
} from '@dakly/contracts/stores';
import { Button } from '@dakly/ui/button';
import { formError } from '@/lib/form-error';
import { useChangeExtensions } from '../api/change-extensions';
export function ExtensionsForm({
  store,
  editable,
}: {
  store: StoreSettingsResponse;
  editable: boolean;
}) {
  const [saved, setSaved] = useState(false);
  const form = useForm<ChangeStoreExtensionsInput>({
    resolver: zodResolver(changeStoreExtensionsSchema),
    defaultValues: {
      extensions: extensionSelection(store),
    },
  });
  const change = useChangeExtensions();
  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit(async (input) => {
        try {
          const result = await change.mutateAsync(input);
          form.reset({
            extensions: extensionSelection(result),
          });
          setSaved(true);
        } catch (error) {
          formError(error, form.setError);
        }
      })}
    >
      <p>Core is always on. Turning an extension off keeps its existing data.</p>
      <ExtensionChoices form={form} disabled={!editable || change.isPending} />
      {form.formState.errors.extensions ? (
        <p role="alert">{form.formState.errors.extensions.message}</p>
      ) : null}
      {form.formState.errors.root ? (
        <p role="alert" className="text-danger">
          {form.formState.errors.root.message}
        </p>
      ) : null}
      {saved ? <p role="status">Extensions saved.</p> : null}
      {editable ? (
        <Button type="submit" loading={change.isPending}>
          Save extensions
        </Button>
      ) : (
        <p>Only the Owner or an Admin can change extensions.</p>
      )}
    </form>
  );
}
