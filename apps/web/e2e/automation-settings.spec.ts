import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';

import type { AutomationDetailResponse } from '@dakly/contracts/automations';
import { createDatabase } from '@dakly/db/client';

test('changes a ready template delay and publishes the workflow', async ({
  page,
  context,
  baseURL,
}) => {
  const { token } = JSON.parse(process.env.BROWSER_FIXTURE!) as { token: string };
  await context.addCookies([
    { name: 'dakly_session', value: token, url: baseURL!, httpOnly: true, sameSite: 'Lax' },
  ]);
  const { contextTag } = await (await context.request.get('/api/me/context')).json();
  const headers = { 'X-Session-Context': contextTag };
  const db = createDatabase(process.env.DATABASE_ADMIN_URL!);
  let id: string | undefined;
  try {
    await page.goto('/automations/new');
    await page.getByRole('button', { name: 'Use workflow Welcome new subscribers' }).click();
    await expect(page).toHaveURL(/\/automations\/[\da-f-]{36}$/);
    id = new URL(page.url()).pathname.split('/').at(-1);
    await expect(page.getByRole('heading', { name: 'Welcome new subscribers' })).toBeVisible();
    const delay = page.getByLabel('Delay in minutes');
    await expect(delay).toHaveValue('2880');
    const evidence = process.env.CAMP12_SETTINGS_EVIDENCE;
    if (evidence) await mkdir(evidence, { recursive: true });
    for (const [width, height] of [
      [1440, 900],
      [360, 800],
    ] as const) {
      await page.setViewportSize({ width, height });
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
        .toBe(true);
      if (evidence)
        await page.screenshot({ path: resolve(evidence, `workflow-settings-${width}.png`) });
    }
    await delay.fill('90');
    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(
      page.getByRole('dialog').getByText('0 people are in this workflow now.'),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Publish workflow', exact: true }).click();
    await expect(page).toHaveURL(/\/automations\?tab=active$/);
    const row = page.getByRole('listitem').filter({ hasText: 'Welcome new subscribers' });
    await expect(row.getByText('Active', { exact: true })).toBeVisible();
    const response = await context.request.get(`/api/automations/${id}`, { headers });
    expect(response.ok()).toBe(true);
    const workflow: AutomationDetailResponse = await response.json();
    expect(workflow.graph.steps.wait).toMatchObject({ wait: { minutes: 90 } });
  } finally {
    if (id) {
      await db.pool.query('update automations set published_version_id=null where id=$1', [id]);
      await db.pool.query('delete from automation_versions where automation_id=$1', [id]);
      await db.pool.query('delete from automations where id=$1', [id]);
    }
    await db.pool.end();
  }
});
