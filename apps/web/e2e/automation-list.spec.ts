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
    const contactId = randomUUID();
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
    await page.goto('/automations');
    await expect(page.getByRole('tab', { name: 'All 4' })).toHaveAttribute('aria-selected', 'true');
    const welcome = page.getByRole('listitem').filter({ hasText: active.name });
    await expect(welcome.locator('dd').first()).toHaveText('1');
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
  } finally {
    await db.pool.query('delete from automation_runs where automation_id=any($1::uuid[])', [ids]);
    await db.pool.query(
      'update automations set published_version_id=null where id=any($1::uuid[])',
      [ids],
    );
    await db.pool.query('delete from automation_versions where automation_id=any($1::uuid[])', [
      ids,
    ]);
    await db.pool.query('delete from automations where id=any($1::uuid[])', [ids]);
    await db.pool.end();
  }
});
