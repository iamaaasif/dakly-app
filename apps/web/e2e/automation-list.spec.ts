import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';

import type { AutomationResponse } from '@dakly/contracts/automations';
import { automationTemplates } from '@dakly/contracts/automations/templates';
import { createDatabase } from '@dakly/db/client';

test('lists workflows, counts recent entries and switches tabs and status', async ({
  page,
  context,
  baseURL,
}) => {
  const fixture = JSON.parse(process.env.BROWSER_FIXTURE!) as {
    token: string;
    storeIds: [string, string];
  };
  const [storeId] = fixture.storeIds;
  const db = createDatabase(process.env.DATABASE_ADMIN_URL!);
  const ids: string[] = [];
  const contactId = randomUUID();
  await context.addCookies([
    { name: 'dakly_session', value: fixture.token, url: baseURL!, httpOnly: true, sameSite: 'Lax' },
  ]);
  const { contextTag } = await (await context.request.get('/api/me/context')).json();
  const headers = { Origin: baseURL!, 'X-Session-Context': contextTag };

  async function workflow(name: string, status: 'active' | 'paused' | 'draft') {
    const response = await context.request.post('/api/automations', {
      headers,
      data: { name, graph: automationTemplates.welcome_new_subscriber.graph },
    });
    expect(response.status()).toBe(201);
    const { id }: AutomationResponse = await response.json();
    ids.push(id);
    if (status === 'draft') return;
    const publish = await context.request.post(`/api/automations/${id}/publish`, { headers });
    expect(publish.status()).toBe(200);
    if (status === 'paused')
      expect(
        (await context.request.post(`/api/automations/${id}/pause`, { headers })).status(),
      ).toBe(200);
    return (await publish.json()) as AutomationResponse;
  }

  try {
    const active = (await workflow('Welcome new subscribers', 'active'))!;
    await workflow('Birthday gift', 'active');
    await workflow('Win back inactive customers', 'paused');
    await workflow('New collection reminder', 'draft');
    await db.pool.query(
      "insert into contacts(id,store_id,name,source,kind) values($1,$2,'নুসরাত জাহান','manual','customer')",
      [contactId, storeId],
    );
    await db.pool.query(
      `insert into automation_runs(id,store_id,automation_id,version_id,contact_id,trigger_key,current_step_key,status,entered_at)
      values($1,$3,$4,$5,$6,'recent','end','done',now()),
            ($2,$3,$4,$5,$6,'old','end','done',now()-interval '31 days')`,
      [randomUUID(), randomUUID(), storeId, active.id, active.publishedVersionId, contactId],
    );
    await db.pool.query(
      `insert into store_daily_metrics (store_id,day,metric,dimension,value)
        values($1,(now() at time zone 'Asia/Dhaka')::date,'marketing_revenue',$2,342800)`,
      [storeId, `automation:${active.id}`],
    );
    await page.goto('/automations');
    await expect(page.getByRole('tab', { name: 'All 4' })).toHaveAttribute('aria-selected', 'true');
    expect(
      await page
        .getByRole('tab')
        .evaluateAll((tabs) =>
          tabs.every((tab) => document.getElementById(tab.getAttribute('aria-controls') ?? '')),
        ),
    ).toBe(true);
    const welcome = page.getByRole('listitem').filter({ hasText: active.name });
    await expect(welcome.locator('dd').first()).toHaveText('1');
    await expect(welcome.getByText('৳3,428', { exact: true })).toBeVisible();
    const evidence = process.env.CAMP12_LIST_EVIDENCE;
    if (evidence) await mkdir(evidence, { recursive: true });
    for (const [width, height] of [
      [1440, 900],
      [360, 800],
    ] as const) {
      await page.setViewportSize({ width, height });
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
        .toBe(true);
      if (evidence) await page.screenshot({ path: resolve(evidence, `list-${width}.png`) });
    }
    await page.getByRole('tab', { name: 'Active 2' }).click();
    await expect(page).toHaveURL(/tab=active/);
    await welcome.getByRole('button', { name: 'Disable' }).click();
    await expect(page.getByRole('tab', { name: 'Active 1' })).toBeVisible();
    await page.getByRole('tab', { name: 'Disabled 2' }).click();
    await welcome.getByRole('button', { name: 'Enable' }).click();
    await expect(page.getByRole('tab', { name: 'Disabled 1' })).toBeVisible();
    await page.getByRole('tab', { name: 'All 4' }).click();
    let releaseCopy!: () => void;
    const copyGate = new Promise<void>((resolve) => {
      releaseCopy = resolve;
    });
    await page.route('**/api/automations', async (route) => {
      if (route.request().method() === 'POST') await copyGate;
      await route.continue();
    });
    const copied = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/automations') && response.request().method() === 'POST',
    );
    await welcome.getByRole('button', { name: `Actions for ${active.name}` }).click();
    try {
      await page.getByRole('menuitem', { name: 'Duplicate' }).click();
      const disable = welcome.getByRole('button', { name: 'Disable' });
      await expect(disable).toBeDisabled();
      await expect(disable).not.toHaveAttribute('aria-busy', 'true');
    } finally {
      releaseCopy();
    }
    const copy: AutomationResponse = await (await copied).json();
    ids.push(copy.id);
    await page.getByRole('tab', { name: 'Draft 2' }).click();
    await page.getByRole('button', { name: `Actions for ${copy.name}` }).click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete workflow' }).click();
    await expect(page.getByRole('tab', { name: 'Draft 1' })).toBeVisible();
  } finally {
    await db.pool.query(
      'delete from store_daily_metrics where store_id=$1 and dimension=any($2::text[])',
      [storeId, ids.map((id) => `automation:${id}`)],
    );
    await db.pool.query('delete from automation_runs where automation_id=any($1::uuid[])', [ids]);
    await db.pool.query(
      'update automations set published_version_id=null where id=any($1::uuid[])',
      [ids],
    );
    await db.pool.query('delete from automation_versions where automation_id=any($1::uuid[])', [
      ids,
    ]);
    await db.pool.query('delete from automations where id=any($1::uuid[])', [ids]);
    await db.pool.query('delete from contacts where id=$1 and store_id=$2', [contactId, storeId]);
    await db.pool.end();
  }
});
