'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';

import { Button } from '@dakly/ui/button';
import { FormField } from '@dakly/ui/form-field';
import { Input } from '@dakly/ui/input';
import { Textarea } from '@dakly/ui/textarea';

import type { DraftInput } from './use-messenger-draft-form';

export function MessengerContentFields() {
  const { register, control } = useFormContext<DraftInput>();
  const length = useWatch({ control, name: 'content.text' }).length;
  return (
    <>
      <FormField
        name="content.imageUrl"
        label="Image link"
        optional
        hint="A picture the shop hosts at an https link. It goes first, as its own message."
      >
        {(field) => (
          <Input
            {...field}
            {...register('content.imageUrl', {
              setValueAs: (value: string | null) => value?.trim() || null,
            })}
            inputMode="url"
          />
        )}
      </FormField>
      <FormField name="content.text" label="Message" hint={`${length} of 640 characters`}>
        {(field) => (
          <Textarea
            {...field}
            {...register('content.text', { setValueAs: (value: string) => value.trim() })}
            rows={5}
          />
        )}
      </FormField>
      <MessengerButtons />
    </>
  );
}

function MessengerButtons() {
  const { register, control } = useFormContext<DraftInput>();
  const { fields, append, remove } = useFieldArray({ control, name: 'content.buttons' });
  return (
    <div className="space-y-2">
      <p className="font-medium">Buttons</p>
      {fields.map((item, index) => (
        <div key={item.id} className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <FormField name={`content.buttons.${index}.title`} label={`Button ${index + 1}`}>
              {(field) => (
                <Input
                  {...field}
                  {...register(`content.buttons.${index}.title`, {
                    setValueAs: (value: string) => value.trim(),
                  })}
                  maxLength={20}
                />
              )}
            </FormField>
          </div>
          <Button
            variant="secondary"
            className="mt-7 px-2"
            aria-label={`Remove button ${index + 1}`}
            onClick={() => remove(index)}
          >
            <Trash2 aria-hidden="true" size={16} strokeWidth={1.75} />
          </Button>
        </div>
      ))}
      {fields.length < 3 && (
        <Button variant="secondary" onClick={() => append({ title: '' })}>
          <Plus aria-hidden="true" size={16} strokeWidth={1.75} /> Add button
        </Button>
      )}
      <p className="text-sm text-text-muted">
        A tap sends the customer back to your Page, which opens a new 24 hour window.
      </p>
    </div>
  );
}
