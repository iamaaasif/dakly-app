import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { Module } from '@nestjs/common';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { AutomationGraph, AutomationStep } from '@dakly/contracts/automations/graph';
import { automationTemplates } from '@dakly/contracts/automations/templates';
import type { StoreAccess } from '@dakly/contracts/team';
import { createDatabase } from '@dakly/db/client';

import { DatabaseModule } from '../platform/database/database.module';
import { AutomationsModule } from './automations.module';
import { AutomationsService } from './automations.service';

class TestModule {}
Module({ imports: [DatabaseModule, AutomationsModule] })(TestModule);

const admin = createDatabase(process.env.DATABASE_ADMIN_URL!);
const appRole = createDatabase(process.env.DATABASE_URL!);
const storeA = randomUUID();
const storeB = randomUUID();
const userId = randomUUID();
const staff = { kind: 'user', userId } as const;
const access = (role: 'owner' | 'marketer'): StoreAccess => ({
  role,
  areas: { automations: 'edit' },
  seeFullPhone: false,
  exportLists: false,
  refund: false,
});
const owner = { access: access('owner'), actor: staff };
let app: INestApplicationContext;
let service: AutomationsService;

const welcome: AutomationGraph = automationTemplates.welcome_new_subscriber.graph;
const smsStep = (next: string): AutomationStep => ({
  kind: 'send',
  category: 'marketing',
  channels: ['sms'],
  message: { text: 'ঈদের অফার: সব শাড়িতে ১০% ছাড়', buttons: [] },
  ifNotReachable: 'skip',
  reviewBeforeSending: false,
  next,
});

function splitAfter(minutes: number): AutomationGraph {
  return {
    ...welcome,
    firstStepKey: 'offer',
    steps: {
      offer: smsStep('wait'),
      wait: { kind: 'wait', wait: { until: 'duration', minutes }, next: 'tapped' },
      tapped: {
        kind: 'condition',
        paths: [{ condition: { kind: 'replied', stepKey: 'offer', buttonKeys: [] }, next: 'end' }],
        elseNext: 'reminder',
      },
      reminder: smsStep('end'),
      end: { kind: 'exit' },
    },
  };
}

async function draft(graph: AutomationGraph = welcome, storeId = storeA) {
  return service.create(storeId, { name: `স্বাগতম ${randomUUID()}`, graph }, staff);
}

async function seedRun(storeId: string, automationId: string, versionId: string) {
  const contactId = randomUUID();
  await admin.pool.query(
    "insert into contacts(id,store_id,name,source,kind) values($1,$2,'রিনা আক্তার','manual','customer')",
    [contactId, storeId],
  );
  const runId = randomUUID();
  await admin.pool.query(
    `insert into automation_runs(id,store_id,automation_id,version_id,contact_id,trigger_key,current_step_key,wake_at)
     values($1,$2,$3,$4,$5,'consent-1','wait','2026-11-18T03:00:00Z')`,
    [runId, storeId, automationId, versionId, contactId],
  );
  return runId;
}

describe('AutomationsService (Postgres)', () => {
  beforeAll(async () => {
    await admin.pool.query(
      "insert into stores(id,name) values($1,'রিনার দোকান'),($2,'করিমের দোকান')",
      [storeA, storeB],
    );
    await admin.pool.query(
      "insert into users(id,name,email) values($1::uuid,'নুসরাত',$1::text || '@example.test')",
      [userId],
    );
    app = await NestFactory.createApplicationContext(TestModule, { logger: false });
    service = app.get(AutomationsService);
  });

  afterAll(async () => {
    try {
      await app?.close();
      const stores = [[storeA, storeB]];
      await admin.pool.query('delete from automation_runs where store_id=any($1::uuid[])', stores);
      await admin.pool.query(
        'update automations set published_version_id=null where store_id=any($1::uuid[])',
        stores,
      );
      for (const table of ['automation_versions', 'automations', 'contacts', 'wallet_ledger'])
        await admin.pool.query(`delete from ${table} where store_id=any($1::uuid[])`, stores);
      await admin.pool.query('delete from stores where id=any($1::uuid[])', stores);
      await admin.pool.query('delete from users where id=$1', [userId]);
    } finally {
      await admin.pool.end();
      await appRole.pool.end();
    }
  });

  it('saves and changes a draft, and archiving removes it from the store', async () => {
    const automation = await draft();
    expect(automation).toMatchObject({ status: 'draft', publishedVersionId: null });

    const changed = await service.change(storeA, automation.id, { name: 'ধন্যবাদ বার্তা' }, staff);
    expect(changed).toMatchObject({ name: 'ধন্যবাদ বার্তা', graph: welcome });
    await service.archive(storeA, automation.id, staff);

    await expect(service.get(storeA, automation.id)).rejects.toMatchObject({
      code: 'AUTOMATION_NOT_FOUND',
    });
    const listed = (await service.list(storeA, { limit: 100 })).items.map((item) => item.id);
    expect(listed).not.toContain(automation.id);
  });

  it('publishes a draft as version 1 and makes it active', async () => {
    const automation = await draft();
    expect(automation).toMatchObject({ status: 'draft', publishedVersionId: null });

    const published = await service.publish(storeA, automation.id, owner);

    const detail = await service.get(storeA, automation.id);
    expect(published.status).toBe('active');
    expect(detail.versions).toEqual([
      expect.objectContaining({ id: published.publishedVersionId, version: 1, isStopped: false }),
    ]);
  });

  it.each([
    [
      'a trigger whose source no task emits yet',
      { ...welcome, trigger: { key: 'comment_on_post', filters: [] } },
      'AUTOMATION_TRIGGER_UNAVAILABLE',
    ],
    [
      'a trigger that needs workflow link taps',
      { ...welcome, trigger: { key: 'link_tapped', filters: [] } },
      'AUTOMATION_TRIGGER_UNAVAILABLE',
    ],
    [
      'a trigger that needs channel connections',
      { ...welcome, trigger: { key: 'chat_started', filters: [] } },
      'AUTOMATION_TRIGGER_UNAVAILABLE',
    ],
    [
      'a trigger that needs Orders',
      { ...welcome, trigger: { key: 'order_placed', filters: [] } },
      'AUTOMATION_TRIGGER_UNAVAILABLE',
    ],
    [
      'a send step on Messenger and WhatsApp only',
      {
        ...welcome,
        steps: {
          ...welcome.steps,
          welcome: { ...smsStep('wait'), channels: ['messenger', 'whatsapp'] },
        },
      },
      'AUTOMATION_CHANNEL_UNREACHABLE',
    ],
    ['a split on replies 119 minutes after the send', splitAfter(119), 'AUTOMATION_SPLIT_TOO_SOON'],
  ] as const)('refuses to publish %s and writes no version', async (_name, graph, code) => {
    const automation = await draft(graph as AutomationGraph);

    await expect(service.publish(storeA, automation.id, owner)).rejects.toMatchObject({ code });

    expect(await service.get(storeA, automation.id)).toMatchObject({
      status: 'draft',
      publishedVersionId: null,
      versions: [],
    });
  });

  it('refuses a Marketer’s publish and enable while only owners and admins approve sends', async () => {
    const automation = await draft();
    const marketer = { access: access('marketer'), actor: staff };

    await expect(service.publish(storeA, automation.id, marketer)).rejects.toMatchObject({
      code: 'AUTOMATION_APPROVAL_DENIED',
      status: 403,
    });
    expect(await service.get(storeA, automation.id)).toMatchObject({
      status: 'draft',
      versions: [],
    });
    await service.publish(storeA, automation.id, owner);
    await service.pause(storeA, automation.id, staff);
    await expect(service.enable(storeA, automation.id, marketer)).rejects.toMatchObject({
      code: 'AUTOMATION_APPROVAL_DENIED',
    });
  });

  it('publishes a split on taps after 2 hours of wait', async () => {
    const automation = await draft(splitAfter(120));
    expect((await service.publish(storeA, automation.id, owner)).status).toBe('active');
  });

  it('keeps a published graph when the draft changes, and the app role cannot change it', async () => {
    const automation = await draft();
    const { publishedVersionId } = await service.publish(storeA, automation.id, owner);
    await service.change(storeA, automation.id, { graph: splitAfter(180) }, staff);

    const version = await admin.pool.query(
      'select graph, version from automation_versions where id=$1',
      [publishedVersionId],
    );
    expect(version.rows).toEqual([{ graph: welcome, version: 1 }]);
    const client = await appRole.pool.connect();
    try {
      await client.query('begin');
      await client.query("select set_config('app.store_id',$1,true)", [storeA]);
      await expect(
        client.query("update automation_versions set graph='{}'::jsonb where id=$1", [
          publishedVersionId,
        ]),
      ).rejects.toMatchObject({ code: '42501' });
    } finally {
      await client.query('rollback');
      client.release();
    }
  });

  it('leaves runs on the old version when a new version is published, until the owner stops it', async () => {
    const automation = await draft();
    const first = await service.publish(storeA, automation.id, owner);
    const runId = await seedRun(storeA, automation.id, first.publishedVersionId!);
    await service.change(storeA, automation.id, { graph: splitAfter(180) }, staff);

    const second = await service.publish(storeA, automation.id, owner);

    const run = await admin.pool.query(
      'select version_id, status from automation_runs where id=$1',
      [runId],
    );
    expect(run.rows).toEqual([{ version_id: first.publishedVersionId, status: 'waiting' }]);
    await expect(
      service.stopVersion(storeA, automation.id, second.publishedVersionId!, staff),
    ).rejects.toMatchObject({ code: 'AUTOMATION_VERSION_IS_CURRENT' });
    await service.stopVersion(storeA, automation.id, first.publishedVersionId!, staff);
    expect((await service.get(storeA, automation.id)).versions).toEqual([
      expect.objectContaining({ version: 1, isStopped: true }),
      expect.objectContaining({ version: 2, isStopped: false }),
    ]);
  });

  it('checks the graph it publishes when a draft edit commits while publish waits', async () => {
    const automation = await draft();
    const unavailable = { ...welcome, trigger: { key: 'chat_started', filters: [] } };
    const editor = await admin.pool.connect();
    try {
      await editor.query('begin');
      await editor.query('select id from automations where id=$1 for update', [automation.id]);
      const publishing = service.publish(storeA, automation.id, owner);
      // Wait until publish is blocked on the row lock, then commit an edit under it.
      let isBlocked = false;
      for (let waited = 0; waited < 100 && !isBlocked; waited += 1) {
        const blocked = await admin.pool.query(
          "select 1 from pg_stat_activity where wait_event_type='Lock' and query like 'update \"automations\"%'",
        );
        isBlocked = Boolean(blocked.rowCount);
        if (!isBlocked) await new Promise((resolve) => setTimeout(resolve, 50));
      }
      expect(isBlocked).toBe(true);
      await editor.query('update automations set draft_graph=$2 where id=$1', [
        automation.id,
        JSON.stringify(unavailable),
      ]);
      await editor.query('commit');

      await expect(publishing).rejects.toMatchObject({ code: 'AUTOMATION_TRIGGER_UNAVAILABLE' });
    } finally {
      editor.release();
    }
    expect(await service.get(storeA, automation.id)).toMatchObject({
      status: 'draft',
      versions: [],
    });
  });

  it('changes the live trigger only on publish', async () => {
    const automation = await draft();
    await service.publish(storeA, automation.id, owner);
    const tagged: AutomationGraph = {
      ...welcome,
      trigger: { key: 'tag_added', filters: [{ field: 'tag', tag: 'ভিআইপি' }] },
    };
    const triggerType = async () =>
      (await admin.pool.query('select trigger_type from automations where id=$1', [automation.id]))
        .rows[0].trigger_type;

    await service.change(storeA, automation.id, { graph: tagged }, staff);
    expect(await triggerType()).toBe('consent_given');
    await service.publish(storeA, automation.id, owner);
    expect(await triggerType()).toBe('tag_added');
  });

  it('numbers two publishes at the same moment 1 and 2', async () => {
    const automation = await draft();

    await Promise.all([
      service.publish(storeA, automation.id, owner),
      service.publish(storeA, automation.id, owner),
    ]);

    const detail = await service.get(storeA, automation.id);
    expect(detail.versions.map((version) => version.version)).toEqual([1, 2]);
    expect(detail.publishedVersionId).toBe(detail.versions[1]!.id);
  });

  it('pauses, enables and archives, and refuses a move the status does not allow', async () => {
    const automation = await draft();
    await expect(service.enable(storeA, automation.id, owner)).rejects.toMatchObject({
      code: 'AUTOMATION_STATUS_NOT_ALLOWED',
    });
    await expect(service.pause(storeA, automation.id, staff)).rejects.toMatchObject({
      code: 'AUTOMATION_STATUS_NOT_ALLOWED',
    });
    await service.publish(storeA, automation.id, owner);

    expect((await service.pause(storeA, automation.id, staff)).status).toBe('paused');
    await expect(service.pause(storeA, automation.id, staff)).rejects.toMatchObject({
      code: 'AUTOMATION_STATUS_NOT_ALLOWED',
    });
    expect((await service.enable(storeA, automation.id, owner)).status).toBe('active');
    await service.archive(storeA, automation.id, staff);

    await expect(service.get(storeA, automation.id)).rejects.toMatchObject({
      code: 'AUTOMATION_NOT_FOUND',
    });
    await expect(service.enable(storeA, automation.id, owner)).rejects.toMatchObject({
      code: 'AUTOMATION_NOT_FOUND',
    });
  });

  it('records a manual pause and leaves a balance pause only to a top-up', async () => {
    const automation = await draft();
    await service.publish(storeA, automation.id, owner);
    expect(await service.pause(storeA, automation.id, staff)).toMatchObject({
      status: 'paused',
      pauseReason: 'manual',
    });
    expect(await service.enable(storeA, automation.id, owner)).toMatchObject({
      status: 'active',
      pauseReason: null,
    });

    await admin.pool.query(
      "update automations set status='paused', pause_reason='balance', balance_pause_revision=1 where id=$1",
      [automation.id],
    );
    for (const move of [
      () => service.enable(storeA, automation.id, owner),
      () => service.publish(storeA, automation.id, owner),
    ])
      await expect(move()).rejects.toMatchObject({
        code: 'AUTOMATION_PAUSED_BY_SYSTEM',
        fields: [{ path: 'pauseReason', message: 'balance' }],
      });
    expect(await service.get(storeA, automation.id)).toMatchObject({
      status: 'paused',
      pauseReason: 'balance',
    });

    const [earlierCredit, laterCredit] = [randomUUID(), randomUUID()];
    await admin.pool.query(
      `insert into wallet_ledger(id,store_id,wallet,revision,kind,quantity_delta,balance_quantity_after,idempotency_key,actor_type)
       values($1::uuid,$3,'sms_credits',1,'adjustment',1,1,$1::text,'system'),
             ($2::uuid,$3,'sms_credits',2,'adjustment',1,2,$2::text,'system')`,
      [earlierCredit, laterCredit, storeA],
    );
    const system = { kind: 'system' } as const;
    // A credit the gate already saw cannot end this pause, even when its event arrives late.
    await service.resumeAfterTopUp(storeA, earlierCredit, system);
    expect((await service.get(storeA, automation.id)).status).toBe('paused');
    await service.resumeAfterTopUp(storeB, laterCredit, system);
    expect((await service.get(storeA, automation.id)).status).toBe('paused');
    await service.resumeAfterTopUp(storeA, laterCredit, system);
    expect(await service.get(storeA, automation.id)).toMatchObject({
      status: 'active',
      pauseReason: null,
    });
  });

  it('keeps the first draft’s trigger as the live trigger when the draft trigger changes', async () => {
    const automation = await draft();
    const graph: AutomationGraph = { ...welcome, trigger: { key: 'link_tapped', filters: [] } };

    await service.change(storeA, automation.id, { graph }, staff);

    const row = await admin.pool.query(
      'select trigger_type, draft_graph from automations where id=$1',
      [automation.id],
    );
    expect(row.rows).toEqual([{ trigger_type: 'consent_given', draft_graph: graph }]);
  });

  it('never reads or changes another store’s workflows', async () => {
    const automation = await draft();
    const { publishedVersionId } = await service.publish(storeA, automation.id, owner);
    const own = await draft(welcome, storeB);

    for (const attempt of [
      () => service.get(storeB, automation.id),
      () => service.change(storeB, automation.id, { name: 'চুরি' }, staff),
      () => service.publish(storeB, automation.id, owner),
      () => service.pause(storeB, automation.id, staff),
      () => service.archive(storeB, automation.id, staff),
    ])
      await expect(attempt()).rejects.toMatchObject({ code: 'AUTOMATION_NOT_FOUND' });
    await expect(
      service.stopVersion(storeB, own.id, publishedVersionId!, staff),
    ).rejects.toMatchObject({ code: 'AUTOMATION_VERSION_NOT_FOUND' });
    const listed = (await service.list(storeB, { limit: 100 })).items.map((item) => item.id);
    expect(listed).toEqual([own.id]);
    expect(await service.get(storeA, automation.id)).toMatchObject({ status: 'active' });
  });
});
