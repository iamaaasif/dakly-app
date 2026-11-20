import { languageChoices, toneChoices } from '../content-studio-labels';
import { ChoiceChips } from './choice-chips';
import type { GenerateForm } from './generate-form-types';

export function StyleFields({ form }: { form: GenerateForm }) {
  const [tone, language] = form.watch(['tone', 'language']);
  return (
    <>
      <ChoiceChips
        legend="Language"
        name="language"
        value={language}
        choices={languageChoices}
        onChange={(value) => form.setValue('language', value)}
      />
      <ChoiceChips
        legend="Tone"
        name="tone"
        value={tone}
        choices={toneChoices}
        onChange={(value) => form.setValue('tone', value)}
      />
    </>
  );
}
