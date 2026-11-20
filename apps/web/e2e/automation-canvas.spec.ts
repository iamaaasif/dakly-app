import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect, type Page, test } from '@playwright/test';

import type { AutomationGraph } from '@dakly/contracts/automations/graph';
import { createDatabase } from '@dakly/db/client';

const branching: AutomationGraph = {
  trigger: { key: 'consent_given', filters: [{ field: 'channel', channels: ['sms'] }] },
  reEntry: { rule: 'every_days', days: 30 },
  workflowFilters: [],
  goal: { kind: 'placed_order' },
  exitConditions: [{ kind: 'got_tag', tag: 'vip' }],
  firstStepKey: 'welcome',
  steps: {
    welcome: {
      kind: 'send',
      category: 'marketing',
      channels: ['sms'],
      message: {
        text: 'Urban Trend: {first_name}, welcome! Tap to see new arrivals {link}',
        buttons: [],
      },
      ifNotReachable: 'skip',
      reviewBeforeSending: false,
      next: 'pause',
    },
    pause: { kind: 'wait', wait: { until: 'duration', minutes: 1440 }, next: 'split' },
    split: {
      kind: 'condition',
      paths: [{ condition: { kind: 'tapped', stepKey: 'welcome' }, next: 'tag' }],
      elseNext: 'reminder',
    },
    tag: { kind: 'action', action: { action: 'add_tag', tag: 'tapped' }, next: 'end' },
    reminder: {
      kind: 'send',
      category: 'marketing',
      channels: ['sms'],
      message: { text: 'Urban Trend: {first_name}, new arrivals are waiting {link}', buttons: [] },
      ifNotReachable: 'skip',
      reviewBeforeSending: false,
      next: 'end',
    },
    end: { kind: 'exit' },
  },
};

async function captureEvidence(page: Page, directory: string | undefined, name: string) {
  for (const [width, height] of [
    [1440, 900],
    [360, 800],
  ] as const) {
    await page.setViewportSize({ width, height });
    // The flow opens on its middle only when the page loads at this width.
    await page.reload();
    await expect(page.getByText('Trigger', { exact: true })).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    if (directory) await page.screenshot({ path: resolve(directory, `${name}-${width}.png`) });
  }
}

// The Else path skips two rows, so its line must run beside the cards in between.
const skipping: AutomationGraph = {
  ...branching,
  firstStepKey: 'split',
  steps: {
    split: {
      kind: 'condition',
      paths: [{ condition: { kind: 'has_tag', tag: 'vip' }, next: 'pause' }],
      elseNext: 'end',
    },
    pause: { kind: 'wait', wait: { until: 'duration', minutes: 60 }, next: 'tag' },
    tag: { kind: 'action', action: { action: 'add_tag', tag: 'waited' }, next: 'end' },
    end: { kind: 'exit' },
  },
};

test('shows a saved workflow as a numbered canvas', async ({ page, context, baseURL }) => {
  const { token } = JSON.parse(process.env.BROWSER_FIXTURE!) as { token: string };
  await context.addCookies([
    { name: 'dakly_session', value: token, url: baseURL!, httpOnly: true, sameSite: 'Lax' },
  ]);
  const { contextTag } = await (await context.request.get('/api/me/context')).json();
  const headers = { Origin: baseURL!, 'X-Session-Context': contextTag };
  const db = createDatabase(process.env.DATABASE_ADMIN_URL!);
  const ids: string[] = [];
  const evidence = process.env.CAMP6_CANVAS_EVIDENCE;
  if (evidence) await mkdir(evidence, { recursive: true });
  try {
    const drafts = [
      { name: 'Welcome new subscribers', templateKey: 'welcome_new_subscriber' },
      { name: 'Welcome with a follow-up split', graph: branching },
      { name: 'Skip ahead for new people', graph: skipping },
    ];
    for (const [index, data] of drafts.entries()) {
      const response = await context.request.post('/api/automations', { headers, data });
      expect(response.status()).toBe(201);
      const { id } = (await response.json()) as { id: string };
      ids.push(id);
      await page.goto(`/automations/${id}/canvas`);
      await expect(page.getByRole('heading', { name: data.name })).toBeVisible();
      await expect(page.getByText('Draft', { exact: true })).toBeVisible();
      const steps = page.getByRole('list', { name: 'Workflow steps' });
      await expect(steps.getByText('Trigger', { exact: true })).toBeVisible();
      await expect(steps.getByText('Exit', { exact: true }).first()).toBeVisible();
      if (index === 1) {
        await expect(steps.getByText('Tapped the link in step 1')).toBeVisible();
        await expect(page.getByText('Else', { exact: true })).toBeVisible();
      }
      await captureEvidence(page, evidence, `canvas-${index + 1}`);
    }
    const zoom = page.getByRole('status').filter({ hasText: '%' });
    await page.getByRole('button', { name: 'Zoom out' }).click();
    await expect(zoom).toHaveText(/^\d+%$/);
    await page.getByRole('button', { name: 'Fit to screen' }).click();
    await page.getByRole('link', { name: 'Workflow settings' }).click();
    await expect(page).toHaveURL(new RegExp(`/automations/${ids.at(-1)}$`));
    await page.getByRole('link', { name: 'View canvas' }).click();
    await expect(page).toHaveURL(new RegExp(`/automations/${ids.at(-1)}/canvas$`));
  } finally {
    await db.pool.query('delete from automations where id=any($1::uuid[])', [ids]);
    await db.pool.end();
  }
});
