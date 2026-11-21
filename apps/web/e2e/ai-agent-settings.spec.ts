import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { createDatabase } from '@dakly/db/client';

test.use({ screenshot: 'off' });

test('opens the AI agent drawer, saves a switch and keeps it after a reload', async ({
  page,
  context,
  baseURL,
}) => {
  const fixture = JSON.parse(process.env.BROWSER_FIXTURE!) as {
    token: string;
    storeIds: [string, string];
  };
  const [storeId] = fixture.storeIds;
  const database = createDatabase(process.env.DATABASE_ADMIN_URL!);
  try {
    await database.pool.query(
      "update stores set extensions = array['sales', 'chats', 'social_auto_post', 'physical_shop'] where id = $1",
      [storeId],
    );
    await context.addCookies([
      {
        name: 'dakly_session',
        value: fixture.token,
        url: baseURL!,
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);
    expect(
      (
        await context.request.post('/api/me/active-store', {
          headers: { Origin: baseURL! },
          data: { storeId },
        })
      ).status(),
    ).toBe(204);
    await page.goto('/chats');
    await page.getByRole('link', { name: 'AI agent' }).click();
    await expect(page).toHaveURL(/agent=settings/);
    const drawer = page.getByRole('dialog', { name: 'Dakly AI agent' });
    await expect(drawer.getByRole('tab', { name: 'Settings' })).toBeVisible();
    await expect(drawer.getByRole('switch', { name: /AI auto-reply/ })).toBeVisible();
    await capture(page, 'settings');
    await drawer.evaluate((element) => element.scrollTo(0, element.scrollHeight));
    await expect(drawer.getByRole('button', { name: 'Save changes' })).toBeInViewport();
    await capture(page, 'settings-bottom', () =>
      drawer.evaluate((element) => element.scrollTo(0, element.scrollHeight)),
    );
    await drawer.evaluate((element) => element.scrollTo(0, 0));

    await drawer.getByRole('switch', { name: /AI auto-reply/ }).click();
    await drawer.getByRole('switch', { name: /Take orders/ }).click();
    await drawer.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('AI agent settings saved.', { exact: true })).toBeVisible();

    await page.reload();
    const reloaded = page.getByRole('dialog', { name: 'Dakly AI agent' });
    await expect(reloaded.getByRole('switch', { name: /AI auto-reply/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(reloaded.getByRole('switch', { name: /Take orders/ })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  } finally {
    await database.pool.query('delete from ai_rule_changes where store_id = $1', [storeId]);
    await database.pool.query('delete from audit_log where store_id = $1 and action like $2', [
      storeId,
      'ai_agent.%',
    ]);
    await database.pool.query('delete from ai_agent_settings where store_id = $1', [storeId]);
    await database.pool.end();
  }
});

test('shows practice mode, keeps the person informed during Go live and survives a slow answer', async ({
  page,
  context,
  baseURL,
}) => {
  const fixture = JSON.parse(process.env.BROWSER_FIXTURE!) as {
    token: string;
    storeIds: [string, string];
  };
  const [storeId] = fixture.storeIds;
  const database = createDatabase(process.env.DATABASE_ADMIN_URL!);
  const connectionId = randomUUID();
  try {
    await database.pool.query(
      "update stores set extensions = array['sales', 'chats', 'social_auto_post', 'physical_shop'] where id = $1",
      [storeId],
    );
    await database.pool.query(
      `insert into channel_connections (id, store_id, kind, external_account_id, display_name)
       values ($1::uuid, $2, 'facebook_page', $1::text, 'Dhaka Threads')`,
      [connectionId, storeId],
    );
    await database.pool.query(
      'insert into ai_agent_settings (store_id, handover_rules, test_questions) values ($1, $2, $3)',
      [
        storeId,
        JSON.stringify({ damagedOrWrong: true, refundsAndExchanges: true, specialRequests: true }),
        JSON.stringify([
          { question: 'Kurti M size koto?', expectedAnswer: '৳1,850, M is in stock' },
          { question: 'Rangamati te COD hobe?', expectedAnswer: 'Yes, COD, ৳120 delivery' },
          { question: 'Kapor ki cotton?', expectedAnswer: 'Yes, 100% cotton' },
        ]),
      ],
    );
    await context.addCookies([
      {
        name: 'dakly_session',
        value: fixture.token,
        url: baseURL!,
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);
    await context.request.post('/api/me/active-store', {
      headers: { Origin: baseURL! },
      data: { storeId },
    });
    await page.route('**/go-live', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 10_000));
      await route.fulfill({ status: 502, body: 'Bad gateway' });
    });

    await page.goto('/chats?agent=settings');
    const drawer = page.getByRole('dialog', { name: 'Dakly AI agent' });
    await expect(drawer.getByText('Practice')).toBeVisible();
    await drawer
      .getByRole('heading', { name: 'Go live' })
      .evaluate((element) => element.scrollIntoView({ block: 'start' }));
    await capture(page, 'go-live', () =>
      drawer
        .getByRole('heading', { name: 'Go live' })
        .evaluate((element) => element.scrollIntoView({ block: 'start' })),
    );

    await drawer.getByRole('button', { name: 'Go live' }).click();
    await expect(drawer.getByText(/This can take a minute/)).toBeVisible();
    await capture(page, 'go-live-progress', () =>
      drawer
        .getByText(/This can take a minute/)
        .evaluate((element) => element.scrollIntoView({ block: 'start' })),
    );
    await expect(drawer.getByText(/took longer than the page waited/)).toBeVisible({
      timeout: 30_000,
    });
    await expect(drawer.getByRole('button', { name: 'Check again' })).toBeVisible();
    await capture(page, 'go-live-cut-off', () =>
      drawer
        .getByRole('button', { name: 'Check again' })
        .evaluate((element) => element.scrollIntoView({ block: 'start' })),
    );
  } finally {
    await database.pool.query('delete from ai_agent_settings where store_id = $1', [storeId]);
    await database.pool.query('delete from channel_connections where id = $1', [connectionId]);
    await database.pool.end();
  }
});

test('shows the Knowledge counts, answers and files, and adds an answer', async ({
  page,
  context,
  baseURL,
}) => {
  const fixture = JSON.parse(process.env.BROWSER_FIXTURE!) as {
    token: string;
    storeIds: [string, string];
  };
  const [storeId] = fixture.storeIds;
  const database = createDatabase(process.env.DATABASE_ADMIN_URL!);
  const fileId = randomUUID();
  try {
    await database.pool.query(
      "update stores set extensions = array['sales', 'chats', 'social_auto_post', 'physical_shop'] where id = $1",
      [storeId],
    );
    await database.pool.query(
      `insert into files (id, store_id, purpose, object_key, file_name, content_type, size_bytes, status)
       values ($1, $2, 'knowledge_file', $3, 'Return policy.pdf', 'application/pdf', 20480, 'ready')`,
      [fileId, storeId, `stores/${storeId}/knowledge/${fileId}`],
    );
    await database.pool.query(
      `insert into knowledge_items (id, store_id, kind, question, answer, keywords, times_used) values
         (gen_random_uuid(), $1, 'policy', 'Where is your showroom?', 'Our showroom is at House 12, Road 5, Dhanmondi. Open 10 am to 10 pm.', '{showroom,dokan,"dokan kothay"}', 41),
         (gen_random_uuid(), $1, 'policy', 'Can I pay cash on delivery?', 'Cash on delivery works everywhere in Bangladesh. Delivery is 120 taka outside Dhaka.', '{cod,cash}', 0)`,
      [storeId],
    );
    await database.pool.query(
      `insert into knowledge_items (id, store_id, kind, source_url, status, facts_count)
       values (gen_random_uuid(), $1, 'url', 'urbantrend.com.bd/policy', 'active', 18)`,
      [storeId],
    );
    await database.pool.query(
      `insert into products (id, store_id, name, price_poisha)
       select gen_random_uuid(), $1, 'Kurti ' || n, 185000 from generate_series(1, 7) n`,
      [storeId],
    );
    await database.pool.query(
      `insert into delivery_zones (id, store_id, name, charge_poisha, bd_area_ids, is_default)
       select gen_random_uuid(), $1, 'Zone ' || n, 6000 + n * 1000, array[n], n = 1 from generate_series(1, 5) n`,
      [storeId],
    );
    await database.pool.query(
      `insert into ai_agent_settings (store_id, extra_rules) values ($1, 'No exchange on sale items.')
       on conflict (store_id) do update set extra_rules = excluded.extra_rules`,
      [storeId],
    );
    await database.pool.query(
      `insert into knowledge_items (id, store_id, kind, file_id, status, facts_count)
       values (gen_random_uuid(), $1, 'file', $2, 'active', 41)`,
      [storeId, fileId],
    );
    await context.addCookies([
      {
        name: 'dakly_session',
        value: fixture.token,
        url: baseURL!,
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);
    await context.request.post('/api/me/active-store', {
      headers: { Origin: baseURL! },
      data: { storeId },
    });
    await page.goto('/chats?agent=knowledge');
    const drawer = page.getByRole('dialog', { name: 'Dakly AI agent' });
    await expect(drawer.getByText('Dhanmondi')).toBeVisible();
    await expect(drawer.getByText('7 products')).toBeVisible();
    await expect(drawer.getByText('6 rules')).toBeVisible();
    await expect(drawer.getByText('2 answers')).toBeVisible();
    await expect(drawer.getByText('2 sources')).toBeVisible();
    await expect(drawer.getByText('Added by you · Used 41 times')).toBeVisible();
    await expect(drawer.getByText('Return policy.pdf')).toBeVisible();
    await expect(drawer.getByText('urbantrend.com.bd/policy')).toBeVisible();
    await capture(page, 'knowledge');
    await capture(page, 'knowledge-files', () =>
      drawer.evaluate((element) => element.scrollTo(0, element.scrollHeight)),
    );
    await drawer.evaluate((element) => element.scrollTo(0, 0));
    await drawer.getByRole('button', { name: 'Add answer' }).click();
    const form = page.getByRole('form', { name: 'Add answer' });
    await form.getByRole('button', { name: 'Save answer' }).click();
    await expect(form.getByText('Write what customers ask.')).toBeVisible();
    await form.getByLabel('When a customer asks').fill('Can I exchange a size?');
    await form.getByLabel('Dakly replies').fill('We exchange within 7 days.');
    await form.getByLabel('Also use it for these words').fill('exchange, size change');
    await capture(page, 'knowledge-add');
    await form.getByRole('button', { name: 'Save answer' }).click();
    await expect(drawer.getByText('We exchange within 7 days.')).toBeVisible();
    await expect(drawer.getByText('size change')).toBeVisible();
    await drawer.getByLabel('Search answers').fill('showroom');
    await expect(drawer.getByText('We exchange within 7 days.')).toBeHidden();
  } finally {
    await database.pool.query('delete from knowledge_chunks where store_id = $1', [storeId]);
    await database.pool.query('delete from knowledge_items where store_id = $1', [storeId]);
    await database.pool.query('delete from files where id = $1', [fileId]);
    await database.pool.query('delete from products where store_id = $1', [storeId]);
    await database.pool.query('delete from delivery_zones where store_id = $1', [storeId]);
    await database.pool.query('delete from ai_agent_settings where store_id = $1', [storeId]);
    await database.pool.end();
  }
});

test('tests the agent with a customer message and shows a reply and a hand-over', async ({
  page,
  context,
  baseURL,
}) => {
  const fixture = JSON.parse(process.env.BROWSER_FIXTURE!) as {
    token: string;
    storeIds: [string, string];
  };
  const [storeId] = fixture.storeIds;
  const database = createDatabase(process.env.DATABASE_ADMIN_URL!);
  try {
    await database.pool.query(
      "update stores set extensions = array['sales', 'chats', 'social_auto_post', 'physical_shop'] where id = $1",
      [storeId],
    );
    await context.addCookies([
      {
        name: 'dakly_session',
        value: fixture.token,
        url: baseURL!,
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);
    await context.request.post('/api/me/active-store', {
      headers: { Origin: baseURL! },
      data: { storeId },
    });
    // The real answer needs the AI model, so the browser test fixes it.
    const answers: Record<string, object> = {
      'Showroom kothay?': {
        kind: 'reply',
        text: 'Amader showroom House 12, Road 5, Dhanmondi. Shokal 10 ta theke raat 10 ta.',
        source: { kind: 'answer', question: 'Where is your showroom?' },
      },
      'Eid er age delivery pabo?': { kind: 'handover', reason: 'out_of_scope' },
    };
    await page.route('**/api/ai-agent/test', async (route) => {
      const { question } = route.request().postDataJSON() as { question: string };
      // A real read gives the response headers that tie an answer to the signed-in shop.
      const real = await route.fetch({
        url: `${baseURL}/api/ai-agent/test-questions`,
        method: 'GET',
      });
      await route.fulfill({
        headers: real.headers(),
        json: answers[question] ?? { kind: 'handover', reason: 'refund' },
      });
    });
    await page.goto('/chats?agent=test');
    const drawer = page.getByRole('dialog', { name: 'Dakly AI agent' });
    await expect(drawer.getByRole('tab', { name: 'Test the agent' })).toBeVisible();
    await capture(page, 'test');
    await drawer.getByRole('button', { name: 'Showroom kothay?' }).click();
    await expect(drawer.getByText('Dhanmondi')).toBeVisible();
    await expect(
      drawer.getByText('Answered from your answer: “Where is your showroom?”'),
    ).toBeVisible();
    await capture(page, 'test-reply');
    await drawer.getByLabel('Customer message').fill('Dam beshi, refund chai');
    await drawer.getByRole('button', { name: 'Test', exact: true }).click();
    await expect(drawer.getByText(/This is about a refund or exchange/)).toBeVisible();
    await expect(drawer.getByText('Hand-off rule')).toBeVisible();
    await capture(page, 'test-handover');
    await drawer.getByLabel('Customer message').fill('Eid er age delivery pabo?');
    await drawer.getByRole('button', { name: 'Test', exact: true }).click();
    await expect(
      drawer.getByText('Dakly doesn’t know this yet, so it calls your team.'),
    ).toBeVisible();
    await capture(page, 'test-unknown');
  } finally {
    // The agent may log a run if the browser route is bypassed; leave none behind.
    await database.pool.query('delete from ai_runs where store_id = $1', [storeId]);
    await database.pool.end();
  }
});

test('shows the rated replies in the Feedback tab and filters them', async ({
  page,
  context,
  baseURL,
}) => {
  const fixture = JSON.parse(process.env.BROWSER_FIXTURE!) as {
    token: string;
    storeIds: [string, string];
  };
  const [storeId] = fixture.storeIds;
  const database = createDatabase(process.env.DATABASE_ADMIN_URL!);
  const connectionId = randomUUID();
  const people = [
    {
      name: 'Habib Rahman',
      ask: 'Panjabi er kapor ki?',
      reply: 'Amader panjabi 100% cotton.',
      rating: 'bad',
      reason: 'missed_the_question',
    },
    {
      name: 'Arif Chowdhury',
      ask: 'Wholesale price koto?',
      reply: 'Dam 2,450 taka.',
      rating: 'bad',
      reason: 'wrong_price_or_stock',
    },
    {
      name: 'Sadia Islam',
      ask: 'Kurti M size ache?',
      reply: 'Ji, M size ache.',
      rating: 'good',
      reason: null,
    },
  ].map((person) => ({ ...person, contactId: randomUUID(), conversationId: randomUUID() }));
  try {
    await database.pool.query(
      "update stores set extensions = array['sales', 'chats', 'social_auto_post', 'physical_shop'] where id = $1",
      [storeId],
    );
    await database.pool.query(
      `insert into channel_connections(id,store_id,kind,external_account_id,display_name,status)
       values($1::uuid,$2,'facebook_page',$1::text,'Dhaka Threads','active')`,
      [connectionId, storeId],
    );
    for (const person of people) {
      const identityId = randomUUID();
      await database.pool.query(
        "insert into contacts(id,store_id,name,source,kind) values($1,$2,$3,'messenger','customer')",
        [person.contactId, storeId, person.name],
      );
      await database.pool.query(
        "insert into contact_identities(id,store_id,contact_id,channel_connection_id,channel,external_id) values($1::uuid,$2,$3,$4,'messenger',$1::text)",
        [identityId, storeId, person.contactId, connectionId],
      );
      await database.pool.query(
        "insert into conversations(id,store_id,contact_id,channel_connection_id,channel) values($1,$2,$3,$4,'messenger')",
        [person.conversationId, storeId, person.contactId, connectionId],
      );
      await database.pool.query(
        `insert into messages(id,store_id,conversation_id,direction,author_type,kind,body,status,created_at,sender_identity_id)
         values(gen_random_uuid(),$1,$2,'in','customer','text',$3,'received',now() - interval '2 hours',$4)`,
        [storeId, person.conversationId, person.ask, identityId],
      );
      await database.pool.query(
        `insert into messages(id,store_id,conversation_id,direction,author_type,kind,body,status,created_at,ai_rating,ai_rating_reason,rated_at)
         values(gen_random_uuid(),$1,$2,'out','ai','text',$3,'sent',now() - interval '1 hour',$4,$5,now())`,
        [storeId, person.conversationId, person.reply, person.rating, person.reason],
      );
    }
    await context.addCookies([
      {
        name: 'dakly_session',
        value: fixture.token,
        url: baseURL!,
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);
    await context.request.post('/api/me/active-store', {
      headers: { Origin: baseURL! },
      data: { storeId },
    });
    await page.goto('/chats?agent=feedback');
    const drawer = page.getByRole('dialog', { name: 'Dakly AI agent' });
    await expect(drawer.getByText('Habib Rahman')).toBeVisible();
    await expect(drawer.getByText('33%')).toBeVisible();
    await expect(drawer.getByText('Sadia Islam')).toBeHidden();
    await capture(page, 'feedback');
    await drawer.getByRole('button', { name: 'Good answers' }).click();
    await expect(page).toHaveURL(/feedback=good/);
    await expect(drawer.getByText('Sadia Islam')).toBeVisible();
    await expect(drawer.getByText('Habib Rahman')).toBeHidden();
    await capture(page, 'feedback-good');
  } finally {
    const owned = [storeId, people.map((person) => person.conversationId)];
    await database.pool.query(
      'delete from messages where store_id = $1 and conversation_id = any($2::uuid[])',
      owned,
    );
    await database.pool.query(
      'delete from conversations where store_id = $1 and id = any($2::uuid[])',
      [storeId, people.map((person) => person.conversationId)],
    );
    await database.pool.query(
      'delete from contact_identities where store_id = $1 and channel_connection_id = $2',
      [storeId, connectionId],
    );
    await database.pool.query('delete from contacts where store_id = $1 and id = any($2::uuid[])', [
      storeId,
      people.map((person) => person.contactId),
    ]);
    await database.pool.query('delete from channel_connections where id = $1', [connectionId]);
    await database.pool.end();
  }
});

async function capture(page: Page, screen: string, afterResize?: () => Promise<unknown>) {
  const evidence = process.env.AI8_SCREENSHOT_DIR;
  if (!evidence) return;
  await mkdir(evidence, { recursive: true });
  for (const [width, height] of [
    [1440, 900],
    [360, 800],
  ] as const) {
    await page.setViewportSize({ width, height });
    await afterResize?.();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    await page.screenshot({ path: resolve(evidence, `${screen}-${width}.png`) });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}
