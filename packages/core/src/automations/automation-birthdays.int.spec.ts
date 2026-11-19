import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { getQueueToken } from '@nestjs/bullmq';
import { Module, type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDatabase } from '@dakly/db/client';

import { ContactsModule } from '../contacts/contacts.module';
import { Clock } from '../platform/clock';
import { DatabaseModule } from '../platform/database/database.module';
import { OutboxModule } from '../platform/outbox/outbox.module';
import { QUEUES } from '../platform/queue/queues';
import { StoresModule } from '../stores/stores.module';
import { AutomationBirthdaySweepService } from './automation-birthday-sweep.service';
import { AutomationBirthdaysService } from './automation-birthdays.service';
import { RecordAutomationBirthdaysJob } from './jobs/record-automation-birthdays.job';

const admin = createDatabase(process.env.DATABASE_ADMIN_URL!);
const dhaka = randomUUID();
const london = randomUUID();
const dhakaContact = randomUUID();
const londonContact = randomUUID();
const deletedContact = randomUUID();

describe('AutomationBirthdaysService (Postgres)', () => {
  let app: INestApplicationContext;
  const at = new Date('2026-11-19T20:00:00.000Z');
  const jobs: { data: { storeId: string }; opts: { jobId: string } }[] = [];

  beforeAll(async () => {
    await admin.pool.query(
      "insert into stores(id,name,time_zone) values($1,'রিনার দোকান','Asia/Dhaka'),($2,'করিমের দোকান','Europe/London')",
      [dhaka, london],
    );
    await admin.pool.query(
      `insert into contacts(id,store_id,name,source,kind,birthday_month,birthday_day,deleted_at)
       values($1,$4,'রিনা আক্তার','manual','customer',11,20,null),
             ($2,$5,'করিম মিয়া','manual','customer',11,20,null),
             ($3,$4,'নুসরাত জাহান','manual','customer',11,20,now())`,
      [dhakaContact, londonContact, deletedContact, dhaka, london],
    );
    class TestModule {}
    Module({
      imports: [DatabaseModule, ContactsModule, OutboxModule, StoresModule],
      providers: [
        AutomationBirthdaysService,
        AutomationBirthdaySweepService,
        { provide: Clock, useValue: { now: () => at } },
        {
          provide: getQueueToken(QUEUES.bulk),
          useValue: { addBulk: async (batch: typeof jobs) => jobs.push(...batch) },
        },
      ],
    })(TestModule);
    app = await NestFactory.createApplicationContext(TestModule, { logger: false });
  });

  afterAll(async () => {
    try {
      await app?.close();
      await admin.pool.query('delete from outbox_events where store_id=any($1::uuid[])', [
        [dhaka, london],
      ]);
      await admin.pool.query('delete from contacts where store_id=any($1::uuid[])', [
        [dhaka, london],
      ]);
      await admin.pool.query('delete from stores where id=any($1::uuid[])', [[dhaka, london]]);
    } finally {
      await admin.pool.end();
    }
  });

  it('records a birthday once on the local date and skips deleted contacts', async () => {
    await app.get(AutomationBirthdaySweepService).sweep();
    const recorder = new RecordAutomationBirthdaysJob(app.get(AutomationBirthdaysService));
    const dhakaJob = jobs.find(({ data }) => data.storeId === dhaka);
    const londonJob = jobs.find(({ data }) => data.storeId === london);
    expect(dhakaJob?.opts.jobId).toContain('2026-11-20');
    expect(londonJob?.opts.jobId).toContain('2026-11-19');
    await recorder.handle(dhakaJob?.data);
    await recorder.handle(dhakaJob?.data);
    await recorder.handle(londonJob?.data);
    const { rows } = await admin.pool.query(
      "select store_id, payload from outbox_events where store_id=any($1::uuid[]) and type='contact.birthday'",
      [[dhaka, london]],
    );
    expect(rows).toEqual([
      { store_id: dhaka, payload: { contactId: dhakaContact, day: '2026-11-20' } },
    ]);
  });
});
