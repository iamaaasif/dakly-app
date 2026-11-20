import type { FieldErrors, Resolver } from 'react-hook-form';

import { brandProfileSchema, type BrandProfile } from '@dakly/contracts/content';

export const voiceChoices = ['Friendly', 'Warm', 'Premium', 'Playful', 'Simple', 'Bold'] as const;

// The screen edits words as comma-separated text and the voice as chips; the API stores arrays and text.
export type BrandValues = {
  voice: string[];
  audience: string;
  preferredWords: string;
  wordsToAvoid: string;
  callToActionBn: string;
  callToActionEn: string;
};

const words = (text: string) =>
  text
    .split(/[,\n]/)
    .map((word) => word.trim())
    .filter(Boolean);

export function profileOf(values: BrandValues): BrandProfile {
  const text = (value: string) => value.trim() || null;
  return {
    voice: values.voice.join(', ') || null,
    audience: text(values.audience),
    preferredWords: words(values.preferredWords),
    wordsToAvoid: words(values.wordsToAvoid),
    callToActionBn: text(values.callToActionBn),
    callToActionEn: text(values.callToActionEn),
  };
}

export function valuesOf(profile: BrandProfile): BrandValues {
  return {
    // Voice words the chips do not offer stay in the list, so saving does not drop them.
    voice: (profile.voice ?? '')
      .split(',')
      .map((word) => word.trim())
      .filter(Boolean),
    audience: profile.audience ?? '',
    preferredWords: profile.preferredWords.join(', '),
    wordsToAvoid: profile.wordsToAvoid.join(', '),
    callToActionBn: profile.callToActionBn ?? '',
    callToActionEn: profile.callToActionEn ?? '',
  };
}

const fields: Record<keyof BrandProfile, keyof BrandValues> = {
  voice: 'voice',
  audience: 'audience',
  preferredWords: 'preferredWords',
  wordsToAvoid: 'wordsToAvoid',
  callToActionBn: 'callToActionBn',
  callToActionEn: 'callToActionEn',
};

export const brandResolver: Resolver<BrandValues> = (values) => {
  const parsed = brandProfileSchema.safeParse(profileOf(values));
  if (parsed.success) return { values, errors: {} };
  const errors: FieldErrors<BrandValues> = {};
  for (const { path, message } of parsed.error.issues) {
    const field = fields[path[0] as keyof BrandProfile];
    errors[field] ??= { type: 'validation', message };
  }
  return { values: {}, errors };
};
