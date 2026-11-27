'use client';
import { Controller, useFormContext } from 'react-hook-form';

import { genders } from '@dakly/contracts/contacts';
import { Checkbox } from '@dakly/ui/checkbox';
import { FormField } from '@dakly/ui/form-field';
import { Input } from '@dakly/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@dakly/ui/select';
import { Textarea } from '@dakly/ui/textarea';

import type { ContactFormValues } from './contact-form-values';
import { ContactTagsInput } from './contact-tags-input';
import { districts } from '@/lib/districts';

const genderLabels = { female: 'Female', male: 'Male', other: 'Other' } as const;

export function PersonFields() {
  const { register } = useFormContext<ContactFormValues>();
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField name="name" label="Full name">
        {(field) => (
          <Input
            {...field}
            {...register('name')}
            autoComplete="name"
            placeholder="e.g. Rahim Ahmed"
          />
        )}
      </FormField>
      <FormField name="phone" label="Mobile number">
        {(field) => (
          <Input
            {...field}
            {...register('phone')}
            type="tel"
            autoComplete="tel"
            placeholder="01XXX-XXXXXX"
          />
        )}
      </FormField>
      <WhatsAppField />
      <FormField name="email" label="Email (optional)">
        {(field) => (
          <Input
            {...field}
            {...register('email')}
            type="email"
            autoComplete="email"
            placeholder="name@email.com"
          />
        )}
      </FormField>
      <GenderField />
      <FormField name="age" label="Age (optional)">
        {(field) => (
          <Input {...field} {...register('age')} inputMode="numeric" placeholder="e.g. 28" />
        )}
      </FormField>
    </div>
  );
}

function WhatsAppField() {
  const { register, control, watch } = useFormContext<ContactFormValues>();
  const sameAsMobile = watch('sameAsMobile');
  return (
    <div className="space-y-2">
      <FormField name="whatsappPhone" label="WhatsApp number">
        {(field) => (
          <Input
            {...field}
            {...register('whatsappPhone')}
            type="tel"
            disabled={sameAsMobile}
            placeholder="01XXX-XXXXXX"
          />
        )}
      </FormField>
      <Controller
        control={control}
        name="sameAsMobile"
        render={({ field }) => (
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={field.value} onCheckedChange={(on) => field.onChange(on === true)} />
            Same as mobile number
          </label>
        )}
      />
    </div>
  );
}

function GenderField() {
  const { control } = useFormContext<ContactFormValues>();
  return (
    <FormField name="gender" label="Gender (optional)">
      {(field) => (
        <Controller
          control={control}
          name="gender"
          render={({ field: value }) => (
            <Select value={value.value} onValueChange={value.onChange}>
              <SelectTrigger {...field}>
                <SelectValue placeholder="Select gender" />
              </SelectTrigger>
              <SelectContent>
                {genders.map((gender) => (
                  <SelectItem key={gender} value={gender}>
                    {genderLabels[gender]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      )}
    </FormField>
  );
}

export function AddressFields() {
  const { register, control } = useFormContext<ContactFormValues>();
  return (
    <>
      <FormField name="address" label="Address">
        {(field) => (
          <Input
            {...field}
            {...register('address')}
            autoComplete="street-address"
            placeholder="House, road, landmark..."
          />
        )}
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField name="area" label="Area">
          {(field) => <Input {...field} {...register('area')} placeholder="e.g. Mirpur 10" />}
        </FormField>
        <FormField name="district" label="City">
          {(field) => (
            <Controller
              control={control}
              name="district"
              render={({ field: value }) => (
                <Select value={value.value} onValueChange={value.onChange}>
                  <SelectTrigger {...field}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {districts.map((district) => (
                      <SelectItem key={district} value={district}>
                        {district}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          )}
        </FormField>
      </div>
    </>
  );
}

export function ExtraFields() {
  const { register, control } = useFormContext<ContactFormValues>();
  return (
    <>
      <FormField name="tags" label="Segments (optional)">
        {(field) => (
          <Controller
            control={control}
            name="tags"
            render={({ field: value }) => (
              <ContactTagsInput id={field.id} tags={value.value} onChange={value.onChange} />
            )}
          />
        )}
      </FormField>
      <FormField name="notes" label="Notes">
        {(field) => (
          <Textarea
            {...field}
            {...register('notes')}
            placeholder="Sizes, preferences, delivery notes"
          />
        )}
      </FormField>
    </>
  );
}
