import type { OutboundCard, OutboundMessage } from '../channel-driver';

// The message bodies the Send API takes, kept apart from the HTTP calls that post them.

// Instagram has no metadata field, so only Messenger echoes the key.
export const messageKey = (message: OutboundMessage) =>
  message.channel === 'messenger' ? { metadata: message.operationKey } : {};

export function cardContent(message: OutboundMessage, card: OutboundCard) {
  const elements = card.elements.map(({ title, subtitle, imageUrl, buttons }) => ({
    title,
    subtitle,
    ...(imageUrl ? { image_url: imageUrl } : {}),
    buttons: buttons.map((button) =>
      button.type === 'link'
        ? { type: 'web_url', title: button.title, url: button.url }
        : { type: 'postback', title: button.title, payload: button.payload },
    ),
  }));
  return {
    attachment: { type: 'template', payload: { template_type: 'generic', elements } },
    ...messageKey(message),
  };
}

export const imageContent = (url: string, key = {}) => ({
  attachment: { type: 'image', payload: { url } },
  ...key,
});

export function messageContent(message: OutboundMessage) {
  if (message.channel === 'instagram') return { text: message.text };
  const metadata = message.operationKey;
  if (!message.buttons?.length) return { text: message.text, metadata };
  const buttons = message.buttons.map(({ title, payload }) => ({
    type: 'postback',
    title,
    payload,
  }));
  return {
    attachment: {
      type: 'template',
      payload: { template_type: 'button', text: message.text, buttons },
    },
    metadata,
  };
}
