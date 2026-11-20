import type { AnalyticsChannel } from '@dakly/contracts/analytics';

export const channelLabels: Record<AnalyticsChannel, string> = {
  whatsapp: 'WhatsApp',
  sms: 'SMS',
  messenger: 'Messenger',
};

// Chart fills and legend swatches share these theme tokens.
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
