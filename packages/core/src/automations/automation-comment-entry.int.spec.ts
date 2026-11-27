import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { Module, type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { AutomationGraph } from '@dakly/contracts/automations/graph';
import { createDatabase } from '@dakly/db/client';

import { CommentPostProductsService } from '../comments/comment-post-products.service';
import { CommentsService } from '../comments/comments.service';
import { ContactsModule } from '../contacts/contacts.module';
import { ConversationIntentService } from '../messaging/conversation-intent.service';
import { OrdersModule } from '../orders/orders.module';
import { Clock } from '../platform/clock';
import { DatabaseModule } from '../platform/database/database.module';
import { SegmentsModule } from '../segments/segments.module';
import { AutomationEntryRepository } from './automation-entry.repository';
import { AutomationEntryService } from './automation-entry.service';

const admin = createDatabase(process.env.DATABASE_ADMIN_URL!);
const storeId = randomUUID();
const connectionId = randomUUID();
const now = new Date('2026-11-27T10:00:00.000Z');
const productId = randomUUID();
const otherProductId = randomUUID();
const claimed = new Set<string>();
const spoken = new Map<string, { text: string; author: string; postId: string }>();
const finished = {
  kind: 'exit' as const,
};

function commentGraph(filters: AutomationGraph['trigger']['filters']): AutomationGraph {
  return {
    trigger: { key: 'comment_on_post', filters },
    reEntry: { rule: 'every_days', days: 30 },
    workflowFilters: [],
    goal: null,
    exitConditions: [],
    firstStepKey: 'end',
    steps: { end: finished },
  };
}

async function workflow(filters: AutomationGraph['trigger']['filters'], status = 'active') {
  const id = randomUUID();
  const version = randomUUID();
  const graph = commentGraph(filters);
  await admin.pool.query(
    "insert into automations(id,store_id,name,trigger_type,status,draft_graph,created_at) values($1,$2,'কমেন্ট থেকে ইনবক্স','comment_on_post',$4,$3,now())",
    [id, storeId, graph, status],
  );
  await admin.pool.query(
    'insert into automation_versions(id,store_id,automation_id,version,graph,published_at) values($1,$2,$3,1,$4,$5)',
    [version, storeId, id, graph, new Date(now.getTime() - 1000)],
  );
  await admin.pool.query('update automations set published_version_id=$2 where id=$1', [
    id,
    version,
  ]);
  return id;
}

describe('comment_on_post entry (Postgres)', () => {
  let app: INestApplicationContext;
  let entries: AutomationEntryService;

  // The comment row is real so the run can point at it; the service reads its words from `spoken`.
  async function comment(text: string, author = 'psid-rina', postId = 'post-1') {
    const id = randomUUID();
    await admin.pool.query(
      `insert into social_comments (id, store_id, channel_connection_id, external_post_id,
        external_comment_id, author_external_id, body, commented_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, storeId, connectionId, postId, randomUUID(), author, text, now],
    );
    spoken.set(id, { text, author, postId });
    await entries.startMatchingComment(storeId, {
      id: randomUUID(),
      type: 'comment.received',
      occurredAt: now.toISOString(),
      payload: { commentId: id },
    });
    return id;
  }
  const runsOf = async (automationId: string) =>
    (
      await admin.pool.query(
        'select trigger_comment_id from automation_runs where automation_id=$1',
        [automationId],
      )
    ).rows;
  const clean = async () => {
    await admin.pool.query('delete from automation_runs where store_id=$1', [storeId]);
    await admin.pool.query('update automations set published_version_id=null where store_id=$1', [
      storeId,
    ]);
    await admin.pool.query('delete from automation_versions where store_id=$1', [storeId]);
    await admin.pool.query('delete from automations where store_id=$1', [storeId]);
    claimed.clear();
  };

  beforeAll(async () => {
    await admin.pool.query("insert into stores(id,name) values($1,'রিনার দোকান')", [storeId]);
    await admin.pool.query(
      `insert into channel_connections (id, store_id, kind, external_account_id, display_name,
        connected_at, access_token_ciphertext, key_version)
       values ($1, $2, 'facebook_page', $4, 'Rina', $3, 'x', 1)`,
      [connectionId, storeId, new Date(now.getTime() - 86_400_000), randomUUID()],
    );
    class TestModule {}
    Module({
      imports: [DatabaseModule, ContactsModule, OrdersModule, SegmentsModule],
      providers: [
        AutomationEntryService,
        AutomationEntryRepository,
        { provide: Clock, useValue: { now: () => now } },
        { provide: ConversationIntentService, useValue: {} },
        {
          provide: CommentsService,
          useValue: {
            triggerFacts: async (_store: string, id: string) => {
              const said = spoken.get(id)!;
              return {
                commentId: id,
                channel: 'messenger',
                channelConnectionId: connectionId,
                externalPostId: said.postId,
                authorExternalId: said.author,
                text: said.text,
                classification: null,
              };
            },
            claimForAutomation: async (_store: string, id: string) =>
              !claimed.has(id) && !!claimed.add(id),
          },
        },
        {
          provide: CommentPostProductsService,
          useValue: {
            forPost: async (_store: string, post: { externalPostId: string }) => ({
              productIds: post.externalPostId === 'post-1' ? [productId] : [],
            }),
          },
        },
      ],
    })(TestModule);
    app = await NestFactory.createApplicationContext(TestModule, { logger: false });
    entries = app.get(AutomationEntryService);
  });

  afterAll(async () => {
    try {
      await app?.close();
      await clean();
      await admin.pool.query('delete from contact_identities where store_id=$1', [storeId]);
      await admin.pool.query('delete from social_comments where store_id=$1', [storeId]);
      await admin.pool.query('delete from outbox_events where store_id=$1', [storeId]);
      await admin.pool.query('delete from contacts where store_id=$1', [storeId]);
      await admin.pool.query('delete from channel_connections where store_id=$1', [storeId]);
      await admin.pool.query('delete from stores where id=$1', [storeId]);
    } finally {
      await admin.pool.end();
    }
  });

  it.each([
    ['দাম কত', 'Bangla'],
    ['dam koto', 'Banglish'],
    ['এটার price কত hobe', 'mixed'],
    ['pp', 'short'],
  ])('answers a price question in %s (%s) and creates the contact', async (text) => {
    const id = await workflow([
      { field: 'comment_intent', intents: ['price'] },
      { field: 'keywords', keywords: ['দাম', 'dam', 'price', 'pp'] },
    ]);
    const commentId = await comment(text, `psid-${randomUUID()}`);
    expect(await runsOf(id)).toEqual([{ trigger_comment_id: commentId }]);
    await clean();
  });

  it('ignores comments that match neither the keywords nor the intent, without creating a contact', async () => {
    const id = await workflow([{ field: 'comment_intent', intents: ['price', 'order'] }]);
    const before = await admin.pool.query(
      'select count(*)::int as n from contacts where store_id=$1',
      [storeId],
    );
    for (const text of [
      'very nice',
      '😍😍😍',
      'damage product dilo',
      'দাম কত? http://spam.example',
    ])
      await comment(text, `psid-${randomUUID()}`);
    expect(await runsOf(id)).toEqual([]);
    const after = await admin.pool.query(
      'select count(*)::int as n from contacts where store_id=$1',
      [storeId],
    );
    expect(after.rows[0].n).toBe(before.rows[0].n);
    await clean();
  });

  it('filters by post and by the products the post shows', async () => {
    const onPost = await workflow([{ field: 'post', externalPostIds: ['post-1'] }]);
    const onProduct = await workflow([{ field: 'product', productIds: [productId] }]);
    const onOtherProduct = await workflow([{ field: 'product', productIds: [otherProductId] }]);
    await comment('dam koto', `psid-${randomUUID()}`, 'post-1');
    expect(await runsOf(onPost)).toHaveLength(1);
    // Only the oldest matching workflow answers, so the second one stays quiet.
    expect(await runsOf(onProduct)).toHaveLength(0);
    expect(await runsOf(onOtherProduct)).toHaveLength(0);
    await clean();
    const other = await workflow([{ field: 'post', externalPostIds: ['post-1'] }]);
    await comment('dam koto', `psid-${randomUUID()}`, 'post-2');
    expect(await runsOf(other)).toHaveLength(0);
    await clean();
  });

  it('gives one person one entry per post, however often they comment', async () => {
    const id = await workflow([]);
    const author = `psid-${randomUUID()}`;
    for (let i = 0; i < 3; i++) await comment('দাম কত', author, 'post-1');
    expect(await runsOf(id)).toHaveLength(1);
    await comment('দাম কত', author, 'post-2');
    expect(await runsOf(id)).toHaveLength(2);
    await clean();
  });

  it('starts nothing when no workflow is active and leaves the comment unclaimed for the AI', async () => {
    const id = await workflow([], 'draft');
    const commentId = await comment('dam koto', `psid-${randomUUID()}`);
    expect(await runsOf(id)).toEqual([]);
    expect(claimed.has(commentId)).toBe(false);
    await clean();
  });
});
