import { contentTones, type ContentWriteInput } from '@dakly/contracts/content-writing';
import { cn } from '@dakly/ui/cn';

type Language = ContentWriteInput['language'];
type Tone = ContentWriteInput['tone'];
export type CaptionSettings = { tone: Tone; language: Language };

// Playful stays in Content Studio; the post design offers these four.
const tones = contentTones.filter((tone): tone is Exclude<Tone, 'playful'> => tone !== 'playful');
const toneLabels: Record<Tone, string> = {
  friendly: 'Friendly',
  festive: 'Festive',
  urgent: 'Urgent',
  premium: 'Premium',
  playful: 'Playful',
};
const languages: { value: Language; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'bn', label: 'Bangla' },
  { value: 'banglish', label: 'Banglish' },
];

type CaptionSettingsFieldsProps = {
  settings: CaptionSettings;
  onSettings: (settings: CaptionSettings) => void;
};

export function CaptionSettingsFields({ settings, onSettings }: CaptionSettingsFieldsProps) {
  return (
    <div className="flex flex-wrap gap-x-8 gap-y-3">
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">Tone</legend>
        <div className="flex flex-wrap gap-2">
          {tones.map((value) => (
            <label key={value} className="cursor-pointer">
              <input
                type="radio"
                name="tone"
                className="peer sr-only"
                checked={settings.tone === value}
                onChange={() => onSettings({ ...settings, tone: value })}
              />
              <span className="flex min-h-10 items-center rounded-full border border-input-border px-3 text-sm peer-checked:border-primary peer-checked:bg-primary-soft peer-checked:text-action peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus">
                {toneLabels[value]}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">Language</legend>
        <div className="flex rounded-md bg-surface-muted p-1">
          {languages.map(({ value, label }) => (
            <label key={value} className="cursor-pointer">
              <input
                type="radio"
                name="language"
                className="peer sr-only"
                checked={settings.language === value}
                onChange={() => onSettings({ ...settings, language: value })}
              />
              <span
                className={cn(
                  'rounded peer-checked:shadow-sm flex min-h-8 items-center px-3 text-sm peer-checked:bg-surface peer-checked:font-medium peer-focus-visible:outline-2 peer-focus-visible:outline-focus',
                )}
              >
                {label}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
