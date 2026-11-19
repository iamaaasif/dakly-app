import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';

import type { AutomationListResponse } from '@dakly/contracts/automations';
import { automationTemplates } from '@dakly/contracts/automations/templates';
import { createDatabase } from '@dakly/db/client';

test('filters the template library and copies a ready workflow into a draft', async ({
  context,
  page,
  baseURL,
}) => {
  const { token } = JSON.parse(process.env.BROWSER_FIXTURE!) as { token: string };
  await context.addCookies([
    { name: 'dakly_session', value: token, url: baseURL!, httpOnly: true, sameSite: 'Lax' },
  ]);
  const { contextTag } = await (await context.request.get('/api/me/context')).json();
  const headers = { 'X-Session-Context': contextTag };
  const before: AutomationListResponse = await (
    await context.request.get('/api/automations', { headers })
  ).json();
  const existing = new Set(before.items.map(({ id }) => id));
  const db = createDatabase(process.env.DATABASE_ADMIN_URL!);
  try {
    await page.goto('/automations');
    await page.getByRole('link', { name: 'Create workflow' }).click();
    await expect(page.getByRole('heading', { name: 'Pick a ready-made workflow' })).toBeVisible();
    const followUp = page.getByRole('article').filter({ hasText: 'Chat follow-up' });
    await expect(followUp.getByText(/Needs a connected channel/)).toBeVisible();
    await expect(followUp.getByRole('button', { name: /Use workflow/ })).toHaveCount(0);
    const evidence = process.env.CAMP12_LIBRARY_EVIDENCE;
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
        await page.screenshot({ path: resolve(evidence, `template-library-${width}.png`) });
    }
    await page
      .getByRole('region', { name: 'Type' })
      .getByRole('button', { name: 'Welcome 1' })
      .click();
    await expect(page).toHaveURL(/type=welcome/);
    await page
      .getByRole('region', { name: 'Goal' })
      .getByRole('button', { name: 'Convert subscribers 1' })
      .click();
    await page
      .getByRole('region', { name: 'Channel' })
      .getByRole('button', { name: 'SMS 1' })
      .click();
    await expect(page).toHaveURL(/type=welcome&goal=convert_subscribers&channel=sms/);
    await page.reload();
    await expect(page.getByRole('article')).toHaveCount(1);
    await page.getByRole('button', { name: 'Use workflow Welcome new subscribers' }).click();
    await expect
      .poll(async () => {
        const current: AutomationListResponse = await (
          await context.request.get('/api/automations', { headers })
        ).json();
        return current.items.find((item) => !existing.has(item.id));
      })
      .toMatchObject({
        templateKey: 'welcome_new_subscriber',
        status: 'draft',
        graph: automationTemplates.welcome_new_subscriber.graph,
      });
    await page.goto('/automations/new');
    await page.getByRole('button', { name: 'Create from scratch' }).click();
    await expect
      .poll(async () => {
        const current: AutomationListResponse = await (
          await context.request.get('/api/automations', { headers })
        ).json();
        return current.items.find(
          (item) => !existing.has(item.id) && item.name === 'Untitled workflow',
        );
      })
      .toMatchObject({ templateKey: null, status: 'draft' });
  } finally {
    const current: AutomationListResponse = await (
      await context.request.get('/api/automations', { headers })
    ).json();
    const added = current.items.filter(
      (item) =>
        !existing.has(item.id) &&
        (item.templateKey === 'welcome_new_subscriber' || item.name === 'Untitled workflow'),
    );
    await db.pool.query('delete from automations where id=any($1::uuid[])', [
      added.map(({ id }) => id),
    ]);
    await db.pool.end();
  }
});
