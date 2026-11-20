import type { ContentPiece } from '@dakly/contracts/content';
import type { contentTones } from '@dakly/contracts/content-writing';

type Kind = ContentPiece['kind'];
type Language = ContentPiece['language'];
type Tone = (typeof contentTones)[number];

export const kindChoices: { value: Kind; label: string }[] = [
  { value: 'facebook_post', label: 'Facebook post' },
  { value: 'instagram_caption', label: 'Instagram caption' },
  { value: 'whatsapp', label: 'WhatsApp message' },
  { value: 'sms', label: 'SMS' },
  { value: 'product_description', label: 'Product description' },
];

export const languageChoices: { value: Language; label: string }[] = [
  { value: 'bn', label: 'Bangla' },
  { value: 'en', label: 'English' },
  { value: 'banglish', label: 'Banglish' },
];

export const toneChoices: { value: Tone; label: string }[] = [
  { value: 'friendly', label: 'Friendly' },
  { value: 'festive', label: 'Festive' },
  { value: 'urgent', label: 'Urgent' },
  { value: 'premium', label: 'Premium' },
  { value: 'playful', label: 'Playful' },
];

export const topicIdeas = [
  'New arrival',
  'Sale or offer',
  'Festival greeting',
  'Back in stock',
  'Thank you',
  'Behind the scenes',
] as const;

export const kindLabel = (kind: Kind) => kindChoices.find(({ value }) => value === kind)!.label;

// Only these two can become a social post.
export const postKinds: Kind[] = ['facebook_post', 'instagram_caption'];
