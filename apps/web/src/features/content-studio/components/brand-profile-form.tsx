'use client';
import { useForm } from 'react-hook-form';

import type { BrandProfile } from '@dakly/contracts/content';
import { Button } from '@dakly/ui/button';

import { useSaveBrandProfile } from '../api/brand-profile';
import { BrandField } from './brand-field';
import { brandResolver, profileOf, valuesOf, type BrandValues } from './brand-form';
import { BrandSection } from './brand-section';
import { VoiceChips } from './voice-chips';

type FieldName = Exclude<keyof BrandValues, 'voice'>;
type BrandProfileFormProps = { profile: BrandProfile; canEdit: boolean };

export function BrandProfileForm({ profile, canEdit }: BrandProfileFormProps) {
  const form = useForm<BrandValues>({ resolver: brandResolver, defaultValues: valuesOf(profile) });
  const save = useSaveBrandProfile();
  const submit = form.handleSubmit((values) =>
    save.mutate(profileOf(values), { onSuccess: (saved) => form.reset(valuesOf(saved)) }),
  );
  const field = (name: FieldName, label: string, hint?: string) => (
    <BrandField form={form} name={name} label={label} hint={hint} disabled={!canEdit} />
  );
  return (
    <form onSubmit={submit} noValidate className="max-w-3xl space-y-4">
      <BrandSection
        title="About your shop"
        hint="Dakly reads this before writing anything for you."
      >
        {field(
          'audience',
          'Who your customers are',
          'Age, city, how they shop. Plain words are fine.',
        )}
      </BrandSection>
      <BrandSection title="How you sound" hint="Pick the words that describe your shop’s voice.">
        <VoiceChips form={form} disabled={!canEdit} />
        <div className="grid gap-4 sm:grid-cols-2">
          {field('preferredWords', 'Words you like to use', 'Separate with commas.')}
          {field('wordsToAvoid', 'Words to never use', 'Dakly will leave these out.')}
        </div>
      </BrandSection>
      <BrandSection
        title="How customers order"
        hint="Added at the end of posts and messages when you choose."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {field('callToActionEn', 'In English')}
          {field('callToActionBn', 'In Bangla')}
        </div>
      </BrandSection>
      {save.error && (
        <p role="alert" className="text-sm text-danger">
          {save.error.message}
        </p>
      )}
      {canEdit && (
        <div className="flex items-center gap-3">
          <Button type="submit" loading={save.isPending}>
            Save brand profile
          </Button>
          {save.isSuccess && !form.formState.isDirty && (
            <p role="status" className="text-sm text-success">
              Brand profile saved
            </p>
          )}
        </div>
      )}
    </form>
  );
}
