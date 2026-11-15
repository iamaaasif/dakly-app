import type { UseFormReturn } from 'react-hook-form';
import type { ChangeStoreExtensionsInput, StoreSettingsResponse } from '@dakly/contracts/stores';
const choices = [
  { value: 'sales', label: 'Sales' },
  { value: 'chats', label: 'Chats' },
  { value: 'social_auto_post', label: 'Social auto-post' },
] as const;
export function ExtensionChoices({
  form,
  disabled,
}: {
  form: UseFormReturn<ChangeStoreExtensionsInput>;
  disabled: boolean;
}) {
  return (
    <fieldset disabled={disabled} className="space-y-3">
      <legend className="font-semibold">Enabled extensions</legend>
      {choices.map((item) => (
        <label key={item.value} className="flex min-h-10 items-center gap-3">
          <input
            type="checkbox"
            value={item.value}
            {...form.register('extensions')}
            className="size-5"
          />
          {item.label}
        </label>
      ))}
    </fieldset>
  );
}
export function extensionSelection(store: StoreSettingsResponse) {
  return choices.filter((item) => store.extensions.includes(item.value)).map((item) => item.value);
}
