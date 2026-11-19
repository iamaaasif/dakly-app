import { describe, expect, it } from 'vitest';

import { parseMetaWebhook } from './meta-webhook';

const timestamp = 1795053600000;
const message = {
  sender: { id: '10003' },
  recipient: { id: '10001' },
  timestamp,
  message: { mid: 'mid.10004', text: 'ডেলিভারি চার্জ কত?' },
};

describe('Meta webhook messages', () => {
  it('reads every Messenger message in a delivery and keeps its Page id', () => {
    const messages = parseMetaWebhook({
      object: 'page',
      entry: [
        {
          id: '10001',
          messaging: [message, { ...message, message: { mid: 'mid.10005', text: 'ধন্যবাদ' } }],
        },
      ],
    });
    expect(messages).toEqual([
      {
        channel: 'messenger',
        accountExternalId: '10001',
        externalConversationId: '10003',
        externalMessageId: 'mid.10004',
        senderExternalId: '10003',
        text: 'ডেলিভারি চার্জ কত?',
        attachmentUrls: [],
        sentAt: new Date(timestamp),
      },
      expect.objectContaining({ externalMessageId: 'mid.10005', text: 'ধন্যবাদ' }),
    ]);
  });

  it('keeps an Instagram attachment and skips echoes and mismatched account ids', () => {
    const messages = parseMetaWebhook({
      object: 'instagram',
      entry: [
        {
          id: '10001',
          messaging: [
            {
              ...message,
              message: {
                mid: 'mid.attachment',
                attachments: [
                  { type: 'image', payload: { url: 'https://cdn.example.test/image' } },
                ],
              },
            },
            { ...message, message: { ...message.message, is_echo: true } },
            { ...message, recipient: { id: '10002' } },
            { ...message, message: { ...message.message, is_self: true } },
            { ...message, message: { ...message.message, is_deleted: true } },
          ],
        },
      ],
    });
    expect(messages).toEqual([
      expect.objectContaining({
        channel: 'instagram',
        externalMessageId: 'mid.attachment',
        text: null,
        attachmentUrls: ['https://cdn.example.test/image'],
      }),
    ]);
  });

  it('returns no inbound message for Page changes, receipts or other webhook objects', () => {
    expect(
      parseMetaWebhook({
        object: 'page',
        entry: [
          {
            id: '10001',
            changes: [{ field: 'feed' }],
            messaging: [{ read: { watermark: timestamp } }],
          },
        ],
      }),
    ).toEqual([]);
    expect(
      parseMetaWebhook({
        object: 'whatsapp_business_account',
        entry: [{ id: '10001', messaging: [message] }],
      }),
    ).toEqual([]);
  });
});
