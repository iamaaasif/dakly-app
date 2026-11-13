import { randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';

const pool = new Pool({ connectionString: requireAdminUrl() });
type Fixture = { client: PoolClient; storeId: string; contactId: string };

afterAll(() => pool.end());

describe('release schema behavior (Postgres)', () => {
  it('rejects an order referencing another store contact', async () => {
    await withFixture(async ({ client, storeId, contactId }) => {
      const otherStore = randomUUID();
      await client.query('insert into stores (id, name, slug) values ($1::uuid, $2, $1::text)', [
        otherStore,
        'রূপা',
      ]);
      await asApp(client, otherStore);
      await expect(insertOrder(client, otherStore, contactId)).rejects.toMatchObject({
        code: '23503',
      });
      expect(storeId).not.toBe(otherStore);
    });
  });

  it('looks up the real store when a temporary stores table shadows its name', async () => {
    await withFixture(async ({ client, storeId }) => {
      await asApp(client, storeId);
      await client.query(
        'create temporary table stores (id uuid, slug text, status text) on commit drop',
      );
      await client.query('insert into pg_temp.stores values ($1, $2, $3)', [
        randomUUID(),
        storeId,
        'active',
      ]);
      const found = await client.query('select public.store_id_for_slug($1) as id', [storeId]);
      expect(found.rows).toEqual([{ id: storeId }]);
    });
  });

  it('lets staff remove an order item while keeping the order', async () => {
    await withFixture(async ({ client, storeId, contactId }) => {
      const orderId = await insertOrder(client, storeId, contactId);
      const itemId = await insertItem(client, storeId, orderId);
      await asApp(client, storeId);
      const deleted = await client.query('delete from order_items where id = $1 returning id', [
        itemId,
      ]);
      expect(deleted.rows).toEqual([{ id: itemId }]);
      const order = await client.query('select id from orders where id = $1', [orderId]);
      expect(order.rows).toEqual([{ id: orderId }]);
    });
  });

  it('lets staff stop a published version', async () => {
    await withFixture(async ({ client, storeId }) => {
      const versionId = await insertVersion(client, storeId);
      await asApp(client, storeId);
      const changed = await client.query(
        'update automation_versions set is_stopped = true where id = $1 returning is_stopped',
        [versionId],
      );
      expect(changed.rows).toEqual([{ is_stopped: true }]);
    });
  });

  it('refuses to rewrite a published version graph', async () => {
    await withFixture(async ({ client, storeId }) => {
      const versionId = await insertVersion(client, storeId);
      await asApp(client, storeId);
      await expect(
        client.query('update automation_versions set graph = $1 where id = $2', [
          { steps: ['changed'] },
          versionId,
        ]),
      ).rejects.toMatchObject({ code: '42501' });
    });
  });

  it('refuses to rewrite an issued invoice document', async () => {
    await withFixture(async ({ client, storeId }) => {
      const invoiceId = await insertInvoice(client, storeId);
      await asApp(client, storeId);
      await expect(
        client.query('update invoices set bill_to = $1 where id = $2', [
          { name: 'পরিবর্তিত' },
          invoiceId,
        ]),
      ).rejects.toMatchObject({ code: '42501' });
    });
  });

  it('lets an invoice be marked paid without changing its document', async () => {
    await withFixture(async ({ client, storeId }) => {
      const invoiceId = await insertInvoice(client, storeId);
      await asApp(client, storeId);
      const paid = await client.query(
        'update invoices set status = $1, paid_at = now() where id = $2 returning status, bill_to, paid_at',
        ['paid', invoiceId],
      );
      expect(paid.rows[0]).toMatchObject({
        status: 'paid',
        bill_to: { name: 'রূপা' },
        paid_at: expect.any(Date),
      });
    });
  });

  it('lets staff revoke an invitation before the person has a user account', async () => {
    await withFixture(async ({ client, storeId }) => {
      const membershipId = randomUUID();
      await client.query(
        'insert into memberships (id, store_id, built_in_role, status, invite_phone) values ($1, $2, $3, $4, $5)',
        [membershipId, storeId, 'support_agent', 'invited', '01711000001'],
      );
      await asApp(client, storeId);
      const removed = await client.query(
        'update memberships set status = $1, removed_at = now() where id = $2 returning status, user_id',
        ['removed', membershipId],
      );
      expect(removed.rows).toEqual([{ status: 'removed', user_id: null }]);
    });
  });

  it('retains the buyer snapshot when a contact is permanently deleted', async () => {
    await withFixture(async ({ client, storeId, contactId }) => {
      const orderId = await insertOrder(client, storeId, contactId);
      await client.query('update orders set buyer_name = $1 where id = $2', ['রূপা আক্তার', orderId]);
      await asApp(client, storeId);
      await client.query('set constraints all deferred');
      await client.query('delete from contacts where id = $1', [contactId]);
      const order = await client.query('select buyer_name, contact_id from orders where id = $1', [
        orderId,
      ]);
      expect(order.rows).toEqual([{ buyer_name: 'রূপা আক্তার', contact_id: null }]);
      await client.query('set constraints all immediate');
    });
  });

  it('reclaims an expired workflow lease without claiming a current one', async () => {
    await withFixture(async ({ client, storeId, contactId }) => {
      const versionId = await insertVersion(client, storeId);
      const staleId = await insertRun(client, storeId, contactId, versionId, new Date(0));
      const currentId = await insertRun(client, storeId, contactId, versionId, new Date());
      await asApp(client, storeId);
      const claimed = await client.query(
        'select automation_run_id, claimed_at from due_automation_runs($1)',
        [100],
      );
      const ids = claimed.rows.map((row: { automation_run_id: string }) => row.automation_run_id);
      expect(ids).toContain(staleId);
      expect(ids).not.toContain(currentId);
      const retried = await client.query(
        'select claimed_at, attempts from automation_runs where id = $1',
        [staleId],
      );
      expect(retried.rows[0].claimed_at.getTime()).toBeGreaterThan(Date.now() - 60_000);
      expect(retried.rows[0].attempts).toBe(1);
      const lease = claimed.rows.find(
        (row: { automation_run_id: string }) => row.automation_run_id === staleId,
      );
      expect(lease.claimed_at).toEqual(retried.rows[0].claimed_at);
      const fenced = await client.query(
        'select id from automation_runs where id = $1 and claimed_at = $2',
        [staleId, lease.claimed_at],
      );
      expect(fenced.rows).toEqual([{ id: staleId }]);
    });
  });

  it('stores saved Bangla content while isolating another store', async () => {
    await withFixture(async ({ client, storeId }) => {
      const otherStoreId = await insertStore(client);
      await asApp(client, storeId);
      const contentId = await insertContent(client, storeId);
      const saved = await client.query('select body from content_pieces where id = $1', [
        contentId,
      ]);
      expect(saved.rows).toEqual([{ body: 'ঈদের নতুন সংগ্রহ দেখুন' }]);
      await asApp(client, otherStoreId);
      expect((await client.query('select id from content_pieces')).rows).toEqual([]);
      await expect(insertContent(client, storeId)).rejects.toMatchObject({ code: '42501' });
    });
  });

  it('stores link visits while isolating another store', async () => {
    await withFixture(async ({ client, storeId }) => {
      const otherStoreId = await insertStore(client);
      const linkId = await insertTrackedLink(client, storeId);
      await asApp(client, storeId);
      const visitId = await insertVisit(client, storeId, linkId);
      expect((await client.query('select id from tracked_link_visits')).rows).toEqual([
        { id: visitId },
      ]);
      await asApp(client, otherStoreId);
      expect((await client.query('select id from tracked_link_visits')).rows).toEqual([]);
      await expect(insertVisit(client, storeId, linkId)).rejects.toMatchObject({ code: '42501' });
    });
  });

  it('rejects a visit attributed to a link from another store', async () => {
    await withFixture(async ({ client, storeId }) => {
      const otherStoreId = await insertStore(client);
      const linkId = await insertTrackedLink(client, storeId);
      await asApp(client, otherStoreId);
      await expect(insertVisit(client, otherStoreId, linkId)).rejects.toMatchObject({
        code: '23503',
      });
    });
  });

  it.each([
    'update ai_rule_changes set summary = $2 where id = $1',
    'delete from ai_rule_changes where id = $1 and summary <> $2',
  ])('preserves AI rule history against %s', async (statement) => {
    await withFixture(async ({ client, storeId }) => {
      const changeId = randomUUID();
      await asApp(client, storeId);
      await client.query(
        `insert into ai_rule_changes (id, store_id, source, target, before, after, summary)
        values ($1, $2, $3, $4, $5, $6, $7)`,
        [
          changeId,
          storeId,
          'settings_edit',
          'store_settings',
          {},
          { language: 'bn' },
          'বাংলা ভাষা নির্বাচন',
        ],
      );
      await expect(client.query(statement, [changeId, 'পরিবর্তিত'])).rejects.toMatchObject({
        code: '42501',
      });
    });
  });

  it('rejects an invoice deletion after issue', async () => {
    await withFixture(async ({ client, storeId }) => {
      const invoiceId = await insertInvoice(client, storeId);
      await asApp(client, storeId);
      await expect(
        client.query('delete from invoices where id = $1', [invoiceId]),
      ).rejects.toMatchObject({ code: '42501' });
    });
  });

  it('reserves only the unrefunded part of a verified payment', async () => {
    await withFixture(async ({ client, storeId }) => {
      const intentId = randomUUID();
      await asApp(client, storeId);
      await client.query(
        `insert into payment_intents (id, store_id, flow, purpose, gateway, amount_poisha,
        merchant_reference, expires_at, verified_amount_poisha, refunded_poisha, reserved_refund_poisha)
        values ($1, $2, $3, $4, $5, 10000, $6, now() + interval '1 day', 10000, 3000, 7000)`,
        [intentId, storeId, 'shop', 'order_full', 'manual', randomUUID()],
      );
      const payment = await client.query(
        'select reserved_refund_poisha from payment_intents where id = $1',
        [intentId],
      );
      expect(payment.rows).toEqual([{ reserved_refund_poisha: '7000' }]);
      await expect(
        client.query('update payment_intents set reserved_refund_poisha = $1 where id = $2', [
          7001,
          intentId,
        ]),
      ).rejects.toMatchObject({ code: '23514' });
    });
  });

  it('rejects two ledger entries at the same wallet revision with different operation keys', async () => {
    await withFixture(async ({ client, storeId }) => {
      await asApp(client, storeId);
      await insertLedgerEntry(client, storeId, 1);
      await insertLedgerEntry(client, storeId, 2);
      const ledger = await client.query('select revision from wallet_ledger order by revision');
      expect(ledger.rows).toEqual([{ revision: 1 }, { revision: 2 }]);
      await expect(insertLedgerEntry(client, storeId, 2)).rejects.toMatchObject({ code: '23505' });
    });
  });

  it('indexes workflow recovery, campaign pages, and post connection references', async () => {
    const indexes = await pool.query<{ indexname: string; indexdef: string }>(
      'select indexname, indexdef from pg_indexes where schemaname = $1 and indexname = any($2)',
      [
        'public',
        [
          'automation_runs_stale_claim_idx',
          'campaign_recipients_campaign_status_idx',
          'post_targets_channel_connection_id_idx',
          'post_targets_post_connection_key',
        ],
      ],
    );
    expect(indexes.rows).toHaveLength(4);
    const definitions = Object.fromEntries(
      indexes.rows.map((row) => [row.indexname, row.indexdef]),
    );
    expect(definitions['automation_runs_stale_claim_idx']).toMatch(
      /\(claimed_at\).*WHERE.*status.*running/,
    );
    expect(definitions['campaign_recipients_campaign_status_idx']).toContain(
      '(campaign_id, status, id)',
    );
    expect(definitions['post_targets_channel_connection_id_idx']).toContain(
      '(channel_connection_id)',
    );
    expect(definitions['post_targets_post_connection_key']).toMatch(
      /CREATE UNIQUE INDEX.*\(post_id, channel_connection_id\)/,
    );
  });

  it('keeps a merge operation idempotent after undo', async () => {
    await withFixture(async ({ client, storeId, contactId }) => {
      const userId = randomUUID();
      const mergedId = randomUUID();
      const operationKey = randomUUID();
      await client.query('insert into users (id, phone, name) values ($1, $2, $3)', [
        userId,
        '01711000001',
        'আসিফ',
      ]);
      await insertContact(client, storeId, mergedId);
      await asApp(client, storeId);
      const mergeId = await insertMerge(client, {
        storeId,
        contactId,
        mergedId,
        userId,
        operationKey,
      });
      await client.query(
        'update contact_merges set undone_at = now(), undone_by_user_id = $1 where id = $2',
        [userId, mergeId],
      );
      await expect(
        insertMerge(client, { storeId, contactId, mergedId, userId, operationKey }),
      ).rejects.toMatchObject({ code: '23505' });
    });
  });
});

async function withFixture(work: (fixture: Fixture) => Promise<void>) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const storeId = randomUUID();
    const contactId = randomUUID();
    await client.query('insert into stores (id, name, slug) values ($1::uuid, $2, $1::text)', [
      storeId,
      'রূপার দোকান',
    ]);
    await insertContact(client, storeId, contactId);
    await work({ client, storeId, contactId });
  } finally {
    await client.query('rollback');
    client.release();
  }
}

async function asApp(client: PoolClient, storeId: string) {
  await client.query('set local role dakly_app');
  await client.query("select set_config('app.store_id', $1, true)", [storeId]);
}

async function insertContact(client: PoolClient, storeId: string, contactId: string) {
  await client.query(
    'insert into contacts (id, store_id, name, source, kind) values ($1, $2, $3, $4, $5)',
    [contactId, storeId, 'রূপা আক্তার', 'manual', 'lead'],
  );
}

async function insertOrder(client: PoolClient, storeId: string, contactId: string) {
  const orderId = randomUUID();
  await client.query(
    `insert into orders (id, store_id, contact_id, number, source, created_by_type,
    recipient_name, recipient_phone, recipient_address, recipient_district, items_total_poisha, cod_amount_poisha)
    values ($1, $2, $3, 1, $4, $5, $6, $7, $8, $9, 10000, 10000)`,
    [
      orderId,
      storeId,
      contactId,
      'manual',
      'user',
      'রূপা আক্তার',
      '01711000001',
      'মিরপুর ১০',
      'Dhaka',
    ],
  );
  return orderId;
}

async function insertItem(client: PoolClient, storeId: string, orderId: string) {
  const productId = randomUUID();
  const variantId = randomUUID();
  const itemId = randomUUID();
  await client.query('insert into products (id, store_id, name) values ($1, $2, $3)', [
    productId,
    storeId,
    'সুতির শাড়ি',
  ]);
  await client.query(
    'insert into product_variants (id, store_id, product_id, title) values ($1, $2, $3, $4)',
    [variantId, storeId, productId, 'নীল'],
  );
  await client.query(
    `insert into order_items (id, store_id, order_id, variant_id, product_name,
    variant_title, quantity, unit_price_poisha, is_stock_tracked) values ($1, $2, $3, $4, $5, $6, 1, 10000, true)`,
    [itemId, storeId, orderId, variantId, 'সুতির শাড়ি', 'নীল'],
  );
  return itemId;
}

async function insertVersion(client: PoolClient, storeId: string) {
  const automationId = randomUUID();
  const versionId = randomUUID();
  await client.query(
    'insert into automations (id, store_id, name, trigger_type, draft_graph) values ($1, $2, $3, $4, $5)',
    [automationId, storeId, 'স্বাগত', 'contact.created', { steps: [] }],
  );
  await client.query(
    'insert into automation_versions (id, store_id, automation_id, version, graph) values ($1, $2, $3, 1, $4)',
    [versionId, storeId, automationId, { steps: [] }],
  );
  return versionId;
}

async function insertInvoice(client: PoolClient, storeId: string) {
  const invoiceId = randomUUID();
  await client.query(
    `insert into invoices (id, store_id, number, financial_year, lines, bill_to,
    subtotal_poisha, vat_rate_basis_points, vat_poisha, total_poisha)
    values ($1, $2, $3, $4, $5, $6, 10000, 0, 0, 10000)`,
    [
      invoiceId,
      storeId,
      invoiceId,
      '2026-27',
      JSON.stringify([{ name: 'মাসিক প্ল্যান', amountPoisha: 10000 }]),
      { name: 'রূপা' },
    ],
  );
  return invoiceId;
}

async function insertRun(
  client: PoolClient,
  storeId: string,
  contactId: string,
  versionId: string,
  claimedAt: Date,
) {
  const runId = randomUUID();
  await client.query(
    `insert into automation_runs (id, store_id, automation_id, version_id, contact_id,
    trigger_key, current_step_key, status, claimed_at)
    select $1::uuid, $2::uuid, automation_id, id, $3::uuid, $1::text, $4, $5, $6::timestamptz from automation_versions where id = $7`,
    [runId, storeId, contactId, 'welcome', 'running', claimedAt, versionId],
  );
  return runId;
}

type Merge = {
  storeId: string;
  contactId: string;
  mergedId: string;
  userId: string;
  operationKey: string;
};
async function insertMerge(client: PoolClient, merge: Merge) {
  const mergeId = randomUUID();
  await client.query(
    `insert into contact_merges (id, store_id, kept_contact_id, merged_contact_id,
    merged_by_user_id, operation_key, moved_rows, replaced_fields, after_state, undo_until)
    values ($1, $2, $3, $4, $5, $6, $7, $7, $7, now() + interval '7 days')`,
    [mergeId, merge.storeId, merge.contactId, merge.mergedId, merge.userId, merge.operationKey, {}],
  );
  return mergeId;
}

function requireAdminUrl(): string {
  const value = process.env['DATABASE_ADMIN_URL'];
  if (!value) throw new Error('DATABASE_ADMIN_URL is not set');
  return value;
}

async function insertStore(client: PoolClient) {
  const storeId = randomUUID();
  await client.query('insert into stores (id, name, slug) values ($1::uuid, $2, $1::text)', [
    storeId,
    'মায়ার দোকান',
  ]);
  return storeId;
}

async function insertContent(client: PoolClient, storeId: string) {
  const contentId = randomUUID();
  await client.query(
    'insert into content_pieces (id, store_id, kind, language, body) values ($1, $2, $3, $4, $5)',
    [contentId, storeId, 'sms', 'bn', 'ঈদের নতুন সংগ্রহ দেখুন'],
  );
  return contentId;
}

async function insertTrackedLink(client: PoolClient, storeId: string) {
  const linkId = randomUUID();
  await client.query(
    'insert into tracked_links (id, store_id, code, target_url, source_type) values ($1, $2, $3, $4, $5)',
    [linkId, storeId, randomUUID(), 'https://example.test/eid', 'campaign'],
  );
  return linkId;
}

async function insertVisit(client: PoolClient, storeId: string, linkId: string) {
  const visitId = randomUUID();
  await client.query(
    'insert into tracked_link_visits (id, store_id, tracked_link_id, event_key, occurred_at) values ($1, $2, $3, $4, now())',
    [visitId, storeId, linkId, randomUUID()],
  );
  return visitId;
}

async function insertLedgerEntry(client: PoolClient, storeId: string, revision: number) {
  await client.query(
    `insert into wallet_ledger (id, store_id, wallet, revision, kind, amount, balance_after, idempotency_key, actor_type)
    values ($1, $2, $3, $4, $5, 100, $6, $7, $8)`,
    [
      randomUUID(),
      storeId,
      'sms_credits',
      revision,
      'top_up',
      revision * 100,
      randomUUID(),
      'system',
    ],
  );
}
