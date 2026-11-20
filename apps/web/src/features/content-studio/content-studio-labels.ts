import {
  Facebook,
  Instagram,
  MessageCircle,
  MessageSquare,
  Package,
  type LucideIcon,
} from 'lucide-react';

import type { ContentPiece } from '@dakly/contracts/content';
import type { contentTones } from '@dakly/contracts/content-writing';

type Kind = ContentPiece['kind'];
type Language = ContentPiece['language'];
type Tone = (typeof contentTones)[number];

// Email subject lines stay hidden until Email ships.
export const kindChoices: {
  value: Kind;
  label: string;
  hint: string;
  icon: LucideIcon;
  tile: string;
}[] = [
  {
    value: 'facebook_post',
    label: 'Facebook post',
    hint: 'For your Page feed',
    icon: Facebook,
    tile: 'bg-info-soft text-facebook',
  },
  {
    value: 'instagram_caption',
    label: 'Instagram caption',
    hint: 'With hashtags',
    icon: Instagram,
    tile: 'bg-surface-muted text-instagram',
  },
  {
    value: 'whatsapp',
    label: 'WhatsApp message',
    hint: 'For a campaign',
    icon: MessageCircle,
    tile: 'bg-success-soft text-success',
  },
  {
    value: 'sms',
    label: 'SMS',
    hint: 'Short and to the point',
    icon: MessageSquare,
    tile: 'bg-ai-soft text-ai',
  },
  {
    value: 'product_description',
    label: 'Product description',
    hint: 'For your website',
    icon: Package,
    tile: 'bg-primary-soft text-action',
  },
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

export type TopicIdea = (typeof topicIdeas)[number];

export const startIdeas: {
  label: string;
  kind: Kind;
  idea: TopicIdea | null;
  notes: string;
}[] = [
  {
    label: 'Announce new winter kurtis',
    kind: 'facebook_post',
    idea: 'New arrival',
    notes: 'New winter kurtis',
  },
  {
    label: 'Weekend offer on WhatsApp',
    kind: 'whatsapp',
    idea: 'Sale or offer',
    notes: 'Weekend offer',
  },
  {
    label: 'Eid greeting for Instagram',
    kind: 'instagram_caption',
    idea: 'Festival greeting',
    notes: 'Eid greeting',
  },
  { label: 'Describe a product', kind: 'product_description', idea: null, notes: '' },
];

export const kindLabel = (kind: Kind) => kindChoices.find(({ value }) => value === kind)!.label;

// Only these two can become a social post.
export const postKinds: Kind[] = ['facebook_post', 'instagram_caption'];
