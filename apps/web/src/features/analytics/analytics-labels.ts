import { MessageCircle, MessageSquare, MessagesSquare } from 'lucide-react';

import type { AnalyticsChannel } from '@dakly/contracts/analytics';

export const channelLabels: Record<AnalyticsChannel, string> = {
  whatsapp: 'WhatsApp',
  sms: 'SMS',
  messenger: 'Messenger',
};

export const channelFills: Record<AnalyticsChannel, { fill: string; swatch: string }> = {
  whatsapp: { fill: 'fill-success', swatch: 'bg-success' },
  sms: { fill: 'fill-ai', swatch: 'bg-ai' },
  messenger: { fill: 'fill-info', swatch: 'bg-info' },
};

export const periodChoices = [
  { days: 30, label: '30 days' },
  { days: 90, label: '3 months' },
  { days: 365, label: '12 months' },
] as const;

export const channelTiles = {
  whatsapp: { icon: MessageCircle, tile: 'bg-success-soft text-success' },
  sms: { icon: MessageSquare, tile: 'bg-ai-soft text-ai' },
  messenger: { icon: MessagesSquare, tile: 'bg-info-soft text-info' },
} as const;

// Short names for the hand-over reasons the AI agent report counts (the feature doc lists them).
export const handoverReasonLabels: Record<string, string> = {
  asked_for_person: 'Asked for a person',
  complaint: 'Complaint',
  refund: 'Refund or exchange',
  discount: 'Asked for a discount',
  angry: 'Upset customer',
  out_of_scope: 'Not in Knowledge',
  ready_to_buy: 'Ready to buy',
  ai_unavailable: 'AI unavailable',
  allowance_used: 'AI replies used up',
  ai_paused: 'AI paused by Dakly',
  other: 'Other',
};
