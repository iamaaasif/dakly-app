import { describe, expect, it } from 'vitest';

import {
  parseMetaComments,
  parseMetaPostbacks,
  parseMetaReceipts,
  parseMetaWebhook,
} from './meta-webhook';

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
        attachments: [],
        referral: null,
        sentAt: new Date(timestamp),
      },
      expect.objectContaining({ externalMessageId: 'mid.10005', text: 'ধন্যবাদ' }),
    ]);
  });

  it('reads the ad or post a first message came from, on the event or on the message', () => {
    const delivery = (event: object) => ({
      object: 'page',
      entry: [{ id: '10001', messaging: [{ ...message, ...event }] }],
    });
    const referral = {
      ref: 'eid',
      source: 'ADS',
      type: 'OPEN_THREAD',
      ad_id: '120000000001',
      ads_context_data: { ad_title: 'Eid kurti', post_id: '10001_5555' },
    };

    const onEvent = parseMetaWebhook(delivery({ referral }));
    const onMessage = parseMetaWebhook(
      delivery({ message: { ...message.message, referral: { ad_id: '120000000002' } } }),
    );
    const plain = parseMetaWebhook(delivery({}));
    const empty = parseMetaWebhook(delivery({ referral: { ref: 'only-a-ref' } }));

    expect(onEvent[0]?.referral).toEqual({
      adId: '120000000001',
      postId: '10001_5555',
      title: 'Eid kurti',
    });
    expect(onMessage[0]?.referral).toEqual({ adId: '120000000002', postId: null, title: null });
    expect(plain[0]?.referral).toBeNull();
    expect(empty[0]?.referral).toBeNull();
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
        attachments: [{ kind: 'image', url: 'https://cdn.example.test/image' }],
      }),
    ]);
  });

  it('maps audio to a voice note and skips shares and locations', () => {
    const attachments = [
      { type: 'audio', payload: { url: 'https://cdn.example.test/voice' } },
      { type: 'share', payload: { url: 'https://cdn.example.test/post' } },
      { type: 'location', payload: { coordinates: { lat: 23.8, long: 90.4 } } },
    ];
    const [parsed] = parseMetaWebhook({
      object: 'page',
      entry: [
        {
          id: '10001',
          messaging: [{ ...message, message: { mid: 'mid.voice', attachments } }],
        },
      ],
    });
    expect(parsed?.attachments).toEqual([{ kind: 'voice', url: 'https://cdn.example.test/voice' }]);
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

describe('Meta webhook comments', () => {
  const facebook = {
    item: 'comment',
    verb: 'add',
    comment_id: '555_1',
    post_id: '10001_555',
    parent_id: '10001_555',
    from: { id: '10003', name: 'Sadia Islam' },
    message: 'Price koto?',
    created_time: 1795053600,
  };
  const delivery = (value: unknown) => ({
    object: 'page',
    entry: [{ id: '10001', time: 1795053601, changes: [{ field: 'feed', value }] }],
  });

  it('reads a Facebook comment on a post and treats the post as its parent', () => {
    expect(parseMetaComments(delivery(facebook))).toEqual([
      {
        channel: 'messenger',
        accountExternalId: '10001',
        externalPostId: '10001_555',
        externalCommentId: '555_1',
        parentExternalCommentId: null,
        authorExternalId: '10003',
        authorName: 'Sadia Islam',
        text: 'Price koto?',
        commentedAt: new Date(1795053600000),
      },
    ]);
  });

  it('keeps the parent of a Facebook reply to another comment', () => {
    const [reply] = parseMetaComments(delivery({ ...facebook, parent_id: '555_0' }));
    expect(reply?.parentExternalCommentId).toBe('555_0');
  });

  it("skips the shop's own comments, edits, removals and other feed items", () => {
    expect(parseMetaComments(delivery({ ...facebook, from: { id: '10001' } }))).toEqual([]);
    expect(parseMetaComments(delivery({ ...facebook, verb: 'edited' }))).toEqual([]);
    expect(parseMetaComments(delivery({ ...facebook, verb: 'remove' }))).toEqual([]);
    expect(parseMetaComments(delivery({ ...facebook, item: 'reaction' }))).toEqual([]);
  });

  it('reads an Instagram comment and uses the delivery time for it', () => {
    const payload = {
      object: 'instagram',
      entry: [
        {
          id: '20001',
          time: 1795053601,
          changes: [
            {
              field: 'comments',
              value: {
                id: 'ig-1',
                text: 'Size M ache?',
                from: { id: '20003', username: 'sadia' },
                media: { id: 'media-1' },
              },
            },
          ],
        },
      ],
    };
    expect(parseMetaComments(payload)).toEqual([
      {
        channel: 'instagram',
        accountExternalId: '20001',
        externalPostId: 'media-1',
        externalCommentId: 'ig-1',
        parentExternalCommentId: null,
        authorExternalId: '20003',
        authorName: 'sadia',
        text: 'Size M ache?',
        commentedAt: new Date(1795053601000),
      },
    ]);
  });

  it('ignores a comment field on the wrong object and malformed entries', () => {
    expect(
      parseMetaComments({
        object: 'instagram',
        entry: [{ id: '1', time: 1, changes: [{ field: 'feed', value: facebook }] }],
      }),
    ).toEqual([]);
    expect(parseMetaComments({ object: 'page', entry: [{ id: '1', changes: 'bad' }] })).toEqual([]);
  });
});
