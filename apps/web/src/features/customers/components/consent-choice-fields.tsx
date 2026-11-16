import { useFormContext } from 'react-hook-form';

import type { RecordConsentInput } from '@dakly/contracts/contacts';
import { FormField } from '@dakly/ui/form-field';

import { channelLabels } from '../customer-labels';

const selectClass = 'min-h-10 w-full rounded-md border border-input-border bg-surface px-3';
// Staff may only record a withdrawal here; a Messenger or Instagram opt-in comes from the customer.
const customerOptInChannels: RecordConsentInput['channel'][] = ['messenger', 'instagram'];

export function ConsentChoiceFields() {
  const { register, watch } = useFormContext<RecordConsentInput>();
  const needsCustomer = customerOptInChannels.includes(watch('channel'));
  return (
    <>
      <FormField name="channel" label="Channel">
        {(control) => (
          <select {...control} {...register('channel')} className={selectClass}>
            {(['whatsapp', 'sms', 'messenger', 'instagram'] as const).map((channel) => (
              <option key={channel} value={channel}>
                {channelLabels[channel]}
              </option>
            ))}
          </select>
        )}
      </FormField>
      <FormField
        name="status"
        label="Answer"
        hint={
          needsCustomer
            ? 'Messenger and Instagram opt-ins come from the customer. You can record a withdrawal.'
            : undefined
        }
      >
        {(control) => (
          <select {...control} {...register('status')} className={selectClass}>
            <option value="granted" disabled={needsCustomer}>
              Agreed to marketing messages
            </option>
            <option value="withdrawn">Does not want marketing messages</option>
          </select>
        )}
      </FormField>
    </>
  );
}
