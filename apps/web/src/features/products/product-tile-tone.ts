const tones = [
  'bg-success-soft text-success',
  'bg-warning-soft text-warning',
  'bg-info-soft text-info',
  'bg-ai-soft text-ai',
  'bg-danger-soft text-danger',
  'bg-primary-soft text-action',
] as const;

// The same product always gets the same tint, so the list does not flicker between loads.
export function productTileTone(name: string) {
  let sum = 0;
  for (const character of name) sum += character.codePointAt(0) ?? 0;
  return tones[sum % tones.length];
}
