import { describe, expect, it } from 'vitest';

import { parseMetaPostbacks, parseMetaReceipts, parseMetaWebhook } from './meta-webhook';

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

describe('Meta webhook receipts', () => {
  it('normalizes Messenger deliveries by id and reads by watermark', () => {
    const target = { sender: { id: '10003' }, recipient: { id: '10001' } };
    expect(
      parseMetaReceipts({
        object: 'page',
        entry: [
          {
            id: '10001',
            messaging: [
              { ...target, delivery: { mids: ['mid.10004'], watermark: timestamp } },
              { ...target, timestamp: timestamp + 500, read: { watermark: timestamp } },
              {
                ...target,
                recipient: { id: 'other' },
                delivery: { mids: ['wrong'], watermark: timestamp },
              },
            ],
          },
        ],
      }),
    ).toEqual([
      {
        kind: 'delivered',
        channel: 'messenger',
        accountExternalId: '10001',
        recipientExternalId: '10003',
        occurredAt: new Date(timestamp),
        externalMessageIds: ['mid.10004'],
      },
      {
        kind: 'read',
        channel: 'messenger',
        accountExternalId: '10001',
        recipientExternalId: '10003',
        occurredAt: new Date(timestamp + 500),
        through: new Date(timestamp),
      },
    ]);
  });

  it('reads an Instagram seen receipt for the specific message', () => {
    expect(
      parseMetaReceipts({
        object: 'instagram',
        entry: [
          {
            id: '10001',
            messaging: [
              {
                sender: message.sender,
                recipient: message.recipient,
                timestamp,
                read: { mid: 'mid.10004' },
              },
            ],
          },
        ],
      }),
    ).toEqual([
      {
        kind: 'read',
        channel: 'instagram',
        accountExternalId: '10001',
        recipientExternalId: '10003',
        occurredAt: new Date(timestamp),
        externalMessageIds: ['mid.10004'],
      },
    ]);
  });

  it('only correlates an echo sent by the Page with an opaque operation id', () => {
    const operationKey = '00000000-0000-4000-8000-000000000001';
    const echo = { mid: 'mid.outside', is_echo: true, metadata: operationKey, app_id: 10111 };
    const outbound = {
      sender: message.recipient,
      recipient: message.sender,
      timestamp,
      message: echo,
    };
    expect(
      parseMetaReceipts({
        object: 'page',
        entry: [
          {
            id: '10001',
            messaging: [
              outbound,
              { ...message, message: echo },
              { ...outbound, message: { ...echo, metadata: 'wrong' } },
            ],
          },
        ],
      }),
    ).toEqual([
      {
        kind: 'echo',
        channel: 'messenger',
        accountExternalId: '10001',
        recipientExternalId: '10003',
        occurredAt: new Date(timestamp),
        externalMessageId: echo.mid,
        operationKey,
        appExternalId: '10111',
      },
    ]);
    expect(
      parseMetaReceipts({ object: 'instagram', entry: [{ id: '10001', messaging: [outbound] }] }),
    ).toEqual([]);
  });
});

describe('Meta webhook postbacks', () => {
  const tap = {
    sender: { id: '10003' },
    recipient: { id: '10001' },
    timestamp,
    postback: { title: 'হ্যাঁ, নিশ্চিত করুন', payload: 'order-confirm:v1:abc', mid: 'm_tap' },
  };

  it('reads a button tap from a Page delivery', () => {
    expect(
      parseMetaPostbacks({ object: 'page', entry: [{ id: '10001', messaging: [tap] }] }),
    ).toEqual([
      {
        channel: 'messenger',
        accountExternalId: '10001',
        senderExternalId: '10003',
        payload: 'order-confirm:v1:abc',
        occurredAt: new Date(timestamp),
      },
    ]);
  });

  it('skips a tap without a payload, one sent by the Page itself and a normal message', () => {
    const messaging = [
      { ...tap, postback: { title: 'x' } },
      { ...tap, postback: { payload: '' } },
      { ...tap, sender: { id: '10001' } },
      { ...tap, recipient: { id: '10002' } },
      message,
    ];
    expect(parseMetaPostbacks({ object: 'page', entry: [{ id: '10001', messaging }] })).toEqual([]);
  });

  it('does not read a button tap as a message or a receipt', () => {
    const delivery = { object: 'page', entry: [{ id: '10001', messaging: [tap] }] };
    expect(parseMetaWebhook(delivery)).toEqual([]);
    expect(parseMetaReceipts(delivery)).toEqual([]);
  });
});
