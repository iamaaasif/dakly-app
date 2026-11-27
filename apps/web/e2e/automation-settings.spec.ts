import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';

import type { AutomationDetailResponse } from '@dakly/contracts/automations';
import { createDatabase } from '@dakly/db/client';

test('publishes ready settings and keeps a refused draft saved', async ({
  page,
  context,
  baseURL,
}) => {
  const { token } = JSON.parse(process.env.BROWSER_FIXTURE!) as { token: string };
  await context.addCookies([
    { name: 'dakly_session', value: token, url: baseURL!, httpOnly: true, sameSite: 'Lax' },
  ]);
  const { contextTag } = await (await context.request.get('/api/me/context')).json();
  const headers = { Origin: baseURL!, 'X-Session-Context': contextTag };
  const db = createDatabase(process.env.DATABASE_ADMIN_URL!);
  const ids: string[] = [];
  try {
    await page.goto('/automations/new');
    await page.getByRole('button', { name: 'Use workflow Welcome new subscribers' }).click();
    await expect(page).toHaveURL(/\/automations\/[\da-f-]{36}\/canvas$/);
    const id = new URL(page.url()).pathname.split('/').at(-2)!;
    ids.push(id);
    await expect(page.getByRole('heading', { name: 'Welcome new subscribers' })).toBeVisible();
    const evidence = process.env.CAMP12_SETTINGS_EVIDENCE;
    if (evidence) await mkdir(evidence, { recursive: true });
    await page.getByRole('button', { name: 'Edit step 2' }).click();
    const delay = page.getByRole('spinbutton', { name: 'Amount' });
    const unit = page.getByRole('combobox', { name: 'Unit' });
    await expect(delay).toHaveValue('2');
    await expect(unit).toHaveText('days');
    await unit.click();
    await page.getByRole('option', { name: 'minutes' }).click();
    await delay.fill('90');
    await page.getByRole('button', { name: 'Done' }).click();
    await page.getByRole('button', { name: 'Edit step 1' }).click();
    await page.getByRole('button', { name: 'Move SMS up' }).click();
    await page.getByRole('button', { name: 'Move SMS up' }).click();
    await page.getByRole('button', { name: 'Done' }).click();
    await page.getByRole('button', { name: 'Workflow options' }).click();
    await page.getByRole('menuitem', { name: 'Workflow settings' }).click();
    await page.getByRole('combobox', { name: 'Re-entry' }).click();
    await page.getByRole('option', { name: 'Once every few days' }).click();
    await page.getByLabel('Days between entries').fill('15');
    await page.getByRole('button', { name: 'Add tag exit rule' }).click();
    await page.getByLabel('Exit tag').fill('vip');
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
    await page.getByRole('button', { name: 'Done' }).click();
    await page.getByRole('button', { name: 'Start workflow', exact: true }).click();
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
    expect(workflow.graph).toMatchObject({
      reEntry: { rule: 'every_days', days: 15 },
      exitConditions: [{ kind: 'got_tag', tag: 'vip' }],
      steps: {
        wait: { wait: { minutes: 90 } },
        welcome: { channels: ['sms', 'whatsapp', 'messenger'] },
      },
    });
    const unready = await context.request.post('/api/automations', {
      headers,
      data: { name: 'Chat follow-up draft', templateKey: 'chat_follow_up' },
    });
    expect(unready.status()).toBe(201);
    const { id: draftId } = (await unready.json()) as { id: string };
    ids.push(draftId);
    await page.goto(`/automations/${draftId}/canvas`);
    await page.getByRole('button', { name: 'Edit step 1' }).click();
    await expect(unit).toHaveText('hours');
    await delay.fill('1.5');
    const savedDelay = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/automations/${draftId}`) &&
        response.request().method() === 'PATCH',
    );
    await page.getByRole('button', { name: 'Done' }).click();
    await page.getByRole('button', { name: 'Publish changes' }).click();
    expect(await (await savedDelay).json()).toMatchObject({
      graph: { steps: { wait: { wait: { minutes: 90 } } } },
    });
    await page.getByRole('button', { name: 'Edit step 1' }).click();
    await delay.fill('3');
    await page.getByRole('button', { name: 'Done' }).click();
    const savedAgain = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/automations/${draftId}`) &&
        response.request().method() === 'PATCH',
    );
    await page.getByRole('button', { name: 'Publish changes' }).click();
    await savedAgain;
    // The canvas checks stop a workflow whose trigger source is missing before it is published.
    await expect(page.getByRole('button', { name: 'Start workflow', exact: true })).toBeDisabled();
    const saved = await context.request.get(`/api/automations/${draftId}`, { headers });
    expect(await saved.json()).toMatchObject({
      status: 'draft',
      graph: { steps: { wait: { wait: { minutes: 3 } } } },
    });
  } finally {
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
