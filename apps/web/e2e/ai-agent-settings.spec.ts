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
    await database.pool.query("update stores set extensions = array['chats'] where id = $1", [
      storeId,
    ]);
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
    await database.pool.query("update stores set extensions = array['chats'] where id = $1", [
      storeId,
    ]);
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

test('lists answers and files in the Knowledge tab and adds an answer', async ({
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
    await database.pool.query("update stores set extensions = array['chats'] where id = $1", [
      storeId,
    ]);
    await database.pool.query(
      `insert into files (id, store_id, purpose, object_key, content_type, size_bytes, status)
       values ($1, $2, 'knowledge_file', $3, 'application/pdf', 20480, 'ready')`,
      [fileId, storeId, `stores/${storeId}/knowledge/${fileId}`],
    );
    await database.pool.query(
      `insert into knowledge_items (id, store_id, kind, answer) values
         (gen_random_uuid(), $1, 'policy', 'Our showroom is at House 12, Road 5, Dhanmondi. Open 10 am to 10 pm.'),
         (gen_random_uuid(), $1, 'policy', 'Cash on delivery works everywhere in Bangladesh. Delivery is 120 taka outside Dhaka.')`,
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
    await expect(drawer.getByText('Learned 41 facts')).toBeVisible();
    await capture(page, 'knowledge');
    await drawer.getByRole('button', { name: 'Add answer' }).click();
    await drawer.getByLabel('Answer', { exact: true }).fill('We exchange within 7 days.');
    await capture(page, 'knowledge-add', () =>
      drawer.getByRole('form', { name: 'Add answer' }).scrollIntoViewIfNeeded(),
    );
    await drawer.getByRole('button', { name: 'Save answer' }).click();
    await expect(drawer.getByText('We exchange within 7 days.')).toBeVisible();
    await drawer.getByLabel('Search answers').fill('showroom');
    await expect(drawer.getByText('We exchange within 7 days.')).toBeHidden();
  } finally {
    await database.pool.query('delete from knowledge_chunks where store_id = $1', [storeId]);
    await database.pool.query('delete from knowledge_items where store_id = $1', [storeId]);
    await database.pool.query('delete from files where id = $1', [fileId]);
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
