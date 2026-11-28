import { BrandField } from './brand-field';
import { BrandSection } from './brand-section';
import type { BrandSectionProps } from './brand-section-props';
import { SegmentedChoice } from './segmented-choice';
import { VoiceChips } from './voice-chips';

const languageChoices = [
  { value: 'bn', label: 'Bangla' },
  { value: 'en', label: 'English' },
  { value: 'banglish', label: 'Banglish' },
] as const;

export function BrandVoiceSection({ form, disabled }: BrandSectionProps) {
  const shared = { form, disabled };
  return (
    <BrandSection title="How you sound" hint="Pick the words that describe your shop’s voice.">
      <VoiceChips form={form} disabled={disabled} />
      <SegmentedChoice
        legend="Usual language"
        name="brand-language"
        value={form.watch('language')}
        choices={[...languageChoices]}
        onChange={(language) => form.setValue('language', language, { shouldDirty: true })}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <BrandField
          {...shared}
          oneLine
          name="preferredWords"
          label="Words you like to use"
          hint="Separate with commas."
        />
        <BrandField
          {...shared}
          oneLine
          name="wordsToAvoid"
          label="Words to never use"
          hint="Dakly will leave these out."
        />
      </div>
    </BrandSection>
  );
}
