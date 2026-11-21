import { Checkbox } from '@dakly/ui/checkbox';

import { languageChoices, lengthChoices, toneChoices } from '../content-studio-labels';
import { BrandProfileRow } from './brand-profile-row';
import { ChoiceChips } from './choice-chips';
import type { GenerateForm } from './generate-form-types';
import { SegmentedChoice } from './segmented-choice';
import { StepHeading } from './step-heading';

export function StyleFields({ form }: { form: GenerateForm }) {
  const [tone, language, length] = form.watch(['tone', 'language', 'length']);
  return (
    <div className="space-y-3">
      <StepHeading step={3}>How should it sound?</StepHeading>
      <div className="flex flex-wrap gap-x-6 gap-y-3">
        <SegmentedChoice
          legend="Language"
          name="language"
          value={language}
          choices={languageChoices}
          onChange={(value) => form.setValue('language', value)}
        />
        <SegmentedChoice
          legend="Length"
          name="length"
          value={length ?? 'medium'}
          choices={lengthChoices}
          onChange={(value) => form.setValue('length', value)}
        />
      </div>
      <ChoiceChips
        legend="Tone"
        name="tone"
        value={tone}
        choices={toneChoices}
        onChange={(value) => form.setValue('tone', value)}
      />
      <OptionBox form={form} name="hashtags" label="Add your hashtags" />
      <OptionBox form={form} name="orderLine" label="End with how to order" />
      <BrandProfileRow />
    </div>
  );
}

function OptionBox({
  form,
  name,
  label,
}: {
  form: GenerateForm;
  name: 'hashtags' | 'orderLine';
  label: string;
}) {
  return (
    <label className="flex items-center gap-3 text-sm">
      <Checkbox
        checked={form.watch(name) !== false}
        onCheckedChange={(value) => form.setValue(name, value === true)}
      />
      {label}
    </label>
  );
}
