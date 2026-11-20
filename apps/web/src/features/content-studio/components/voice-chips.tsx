import type { UseFormReturn } from 'react-hook-form';

import { cn } from '@dakly/ui/cn';

import { voiceChoices, type BrandValues } from './brand-form';

type VoiceChipsProps = { form: UseFormReturn<BrandValues>; disabled: boolean };

export function VoiceChips({ form, disabled }: VoiceChipsProps) {
  const voice = form.watch('voice');
  const toggle = (word: string) =>
    form.setValue(
      'voice',
      voice.includes(word) ? voice.filter((v) => v !== word) : [...voice, word],
      {
        shouldDirty: true,
      },
    );
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium">Voice</legend>
      <div className="flex flex-wrap gap-2">
        {voiceChoices.map((word) => (
          <button
            key={word}
            type="button"
            disabled={disabled}
            aria-pressed={voice.includes(word)}
            onClick={() => toggle(word)}
            className={cn(
              'min-h-10 rounded-full border border-input-border px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-60',
              voice.includes(word) && 'border-primary bg-primary-soft text-action',
            )}
          >
            {word}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
