import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { type BrowserContext, expect, type Locator, type Page, test } from '@playwright/test';

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

async function signIn(context: BrowserContext, baseURL: string) {
  const { token, storeIds } = JSON.parse(process.env.BROWSER_FIXTURE!) as {
    token: string;
    storeIds: string[];
  };
  await context.addCookies([
    { name: 'dakly_session', value: token, url: baseURL, httpOnly: true, sameSite: 'Lax' },
  ]);
  const { contextTag } = await (await context.request.get('/api/me/context')).json();
  return { storeIds, headers: { Origin: baseURL, 'X-Session-Context': contextTag } };
}

test('shows a saved workflow as a numbered canvas', async ({ page, context, baseURL }) => {
  const { headers, storeIds } = await signIn(context, baseURL!);
  const db = createDatabase(process.env.DATABASE_ADMIN_URL!);
  const ids: string[] = [];
  const eventId = randomUUID();
  const evidence = process.env.CAMP6_CANVAS_EVIDENCE;
  if (evidence) await mkdir(evidence, { recursive: true });
  try {
    await db.pool.query(
      `insert into outbox_events(id,store_id,type,payload,occurred_at)
       values($1,$2,'consent.changed',$3,now())`,
      [
        eventId,
        storeIds[0],
        { contactId: randomUUID(), channel: 'sms', status: 'granted', source: 'manual' },
      ],
    );
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
        await expect(page.getByText('No', { exact: true })).toBeVisible();
      }
      await captureEvidence(page, evidence, `canvas-${index + 1}`);
    }
    const trigger = page.getByRole('list', { name: 'Workflow steps' });
    await expect(trigger.getByText('Last 7 days')).toBeVisible();
    await expect(trigger.getByText('1 person', { exact: true })).toBeVisible();
    const zoom = page.getByRole('status').filter({ hasText: '%' });
    await page.getByRole('button', { name: 'Zoom out' }).click();
    await expect(zoom).toHaveText(/^\d+%$/);
    await page.getByRole('button', { name: 'Fit to screen' }).click();
    await page.getByRole('button', { name: 'Workflow options' }).click();
    await page.getByRole('menuitem', { name: 'Workflow settings' }).click();
    await expect(page.getByRole('dialog', { name: 'Workflow settings' })).toBeVisible();
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page).toHaveURL(new RegExp(`/automations/${ids.at(-1)}/canvas$`));
  } finally {
    await db.pool.query('delete from outbox_events where id=$1', [eventId]);
    await db.pool.query('delete from automations where id=any($1::uuid[])', [ids]);
    await db.pool.end();
  }
});

async function screenshotBoth(page: Page, directory: string | undefined, name: string) {
  if (!directory) return;
  for (const [width, height] of [
    [1440, 900],
    [360, 800],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.screenshot({ path: resolve(directory, `${name}-${width}.png`) });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

test('shows separate Messenger and fallback messages in a COD confirmation', async ({
  page,
  context,
  baseURL,
}) => {
  const { headers } = await signIn(context, baseURL!);
  const db = createDatabase(process.env.DATABASE_ADMIN_URL!);
  const created = await context.request.post('/api/automations', {
    headers,
    data: { name: 'Confirm a COD order', templateKey: 'cod_order_confirmation' },
  });
  expect(created.status()).toBe(201);
  const { id } = (await created.json()) as { id: string };
  try {
    await page.goto(`/automations/${id}/canvas`);
    await page.getByRole('button', { name: 'Edit step 1' }).click();
    await expect(page.getByLabel('Messenger message')).toHaveValue(/\{order_number\}/u);
    await expect(page.getByLabel('Fallback message')).toHaveValue(/\{confirm_link\}/u);
    const evidence = resolve(process.cwd(), 'e2e-artifacts/ord-4-messenger');
    await mkdir(evidence, { recursive: true });
    await screenshotBoth(page, evidence, 'message');
  } finally {
    await db.pool.query('delete from automations where id=$1', [id]);
    await db.pool.end();
  }
});

test('adds, deletes and saves steps on the canvas', async ({ page, context, baseURL }) => {
  const { headers } = await signIn(context, baseURL!);
  const db = createDatabase(process.env.DATABASE_ADMIN_URL!);
  const evidence = process.env.CAMP6_CANVAS_EVIDENCE;
  if (evidence) await mkdir(evidence, { recursive: true });
  const created = await context.request.post('/api/automations', {
    headers,
    data: { name: 'Edit on the canvas', templateKey: 'welcome_new_subscriber' },
  });
  const { id } = (await created.json()) as { id: string };
  try {
    await page.goto(`/automations/${id}/canvas`);
    const steps = page.getByRole('list', { name: 'Workflow steps' });
    await expect(steps.getByText('Trigger', { exact: true })).toBeVisible();
    const before = await steps.getByRole('listitem').count();
    await page.getByRole('button', { name: 'Delay' }).click();
    await expect(steps.getByText('Wait for')).toHaveCount(2);
    await page.getByRole('button', { name: 'Edit step 4' }).click();
    await expect(page).toHaveURL(/step=delay_1/);
    await page.getByLabel('Amount').fill('3');
    await screenshotBoth(page, evidence, 'panel-wait');
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page).not.toHaveURL(/step=/);
    await expect(steps.getByText('3 days')).toBeVisible();
    await page.getByRole('button', { name: 'Edit step 1' }).click();
    await expect(page.getByLabel('Message')).toBeVisible();
    await screenshotBoth(page, evidence, 'panel-send');
    await page.getByRole('button', { name: 'Done' }).click();
    await page.getByRole('button', { name: /Options for step 4/ }).click();
    await expect(page.getByRole('menuitem', { name: 'Move down' })).toBeDisabled();
    await page.getByRole('menuitem', { name: 'Move up' }).click();
    await page.getByRole('button', { name: /Options for step 3/ }).click();
    await expect(page.getByRole('menuitem', { name: 'Move down' })).toBeEnabled();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Add a step here' }).first().click();
    await page.getByRole('menuitem', { name: 'Tag contact' }).click();
    await expect(steps.getByText('Tag contact')).toBeVisible();
    const checks = page.getByRole('region', { name: 'Workflow checks' });
    await expect(checks.getByText(/sample tag/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start workflow' })).toBeDisabled();
    for (const [width, height] of [
      [1440, 900],
      [360, 800],
    ] as const) {
      await page.setViewportSize({ width, height });
      if (evidence) await page.screenshot({ path: resolve(evidence, `checks-${width}.png`) });
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await checks.getByRole('button', { name: 'Delete step' }).click();
    await expect(steps.getByText('Tag contact')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Start workflow' })).toBeEnabled();
    // The canvas no longer scrolls, so a plus button off screen is reached by fitting the flow.
    await page.getByRole('button', { name: 'Fit to screen' }).click();
    await page.getByRole('button', { name: 'Add a step here' }).first().click();
    await page.getByRole('menuitem', { name: 'Tag contact' }).click();
    await page.getByRole('button', { name: 'Fit to screen' }).click();
    await page.getByRole('button', { name: /Options for step 1/ }).click();
    await page.getByRole('menuitem', { name: 'Delete step' }).click();
    await expect(steps.getByText('Tag contact')).toHaveCount(0);
    await expect(steps.getByRole('listitem')).toHaveCount(before + 1);
    await page.getByRole('button', { name: 'Workflow options' }).click();
    await page.getByRole('menuitem', { name: 'Rename workflow' }).click();
    await page.getByLabel('Workflow name').fill('Renamed on the canvas');
    await page.getByRole('button', { name: 'Save name' }).click();
    await expect(page.getByRole('heading', { name: 'Renamed on the canvas' })).toBeVisible();
    await page.getByRole('button', { name: 'Publish changes' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible();
    await page.reload();
    await expect(steps.getByText('Wait for')).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'Publish changes' })).toBeDisabled();
    await captureEvidence(page, evidence, 'editor');
  } finally {
    await db.pool.query('delete from automations where id=$1', [id]);
    await db.pool.end();
  }
});

test('shows how many entries reached each step', async ({ page, context, baseURL }) => {
  const { headers, storeIds } = await signIn(context, baseURL!);
  const db = createDatabase(process.env.DATABASE_ADMIN_URL!);
  const evidence = process.env.CAMP6_CANVAS_EVIDENCE;
  if (evidence) await mkdir(evidence, { recursive: true });
  const created = await context.request.post('/api/automations', {
    headers,
    data: { name: 'Stats on the canvas', templateKey: 'welcome_new_subscriber' },
  });
  const { id } = (await created.json()) as { id: string };
  const contactId = randomUUID();
  const versionId = randomUUID();
  const runId = randomUUID();
  const [storeId] = storeIds;
  try {
    await db.pool.query(
      "insert into contacts(id,store_id,name,source,kind) values($1,$2,'Rina','manual','customer')",
      [contactId, storeId],
    );
    await db.pool.query(
      `insert into automation_versions(id,store_id,automation_id,version,graph)
       select $1,$2,id,1,draft_graph from automations where id=$3`,
      [versionId, storeId, id],
    );
    await db.pool.query(
      `insert into automation_runs(id,store_id,automation_id,version_id,contact_id,trigger_key,current_step_key,status,wake_at)
       values($1,$2,$3,$4,$5,'consent-1','wait','waiting',now() + interval '1 day')`,
      [runId, storeId, id, versionId, contactId],
    );
    await db.pool.query(
      `insert into automation_run_steps(id,store_id,run_id,contact_id,step_key,kind,outcome,sent_at,tapped_at)
       values(gen_random_uuid(),$1,$2,$3,'welcome','send','sent',now(),now()),
             (gen_random_uuid(),$1,$2,$3,'wait','wait','waiting',null,null)`,
      [storeId, runId, contactId],
    );
    await page.goto(`/automations/${id}/canvas`);
    const steps = page.getByRole('list', { name: 'Workflow steps' });
    await expect(steps.getByText('Trigger', { exact: true })).toBeVisible();
    await expect(steps.getByText(/entry|entries|tapped/)).toHaveCount(0);
    await page.getByRole('button', { name: 'Workflow options' }).click();
    await page.getByRole('menuitemcheckbox', { name: 'Show stats' }).click();
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/stats=1/);
    await page.reload();
    await expect(steps.getByText(/^1 sent · 1 tapped/)).toBeVisible();
    await expect(steps.getByText(/^1 entry/)).toBeVisible();
    await expect(steps.getByText(/^0 sent · 0 tapped/)).toBeVisible();
    for (const [width, height] of [
      [1440, 900],
      [360, 800],
    ] as const) {
      await page.setViewportSize({ width, height });
      if (evidence) await page.screenshot({ path: resolve(evidence, `stats-${width}.png`) });
    }
  } finally {
    await db.pool.query('delete from automation_runs where automation_id=$1', [id]);
    await db.pool.query('update automations set published_version_id=null where id=$1', [id]);
    await db.pool.query('delete from automation_versions where automation_id=$1', [id]);
    await db.pool.query('delete from automations where id=$1', [id]);
    await db.pool.query('delete from contacts where id=$1', [contactId]);
    await db.pool.end();
  }
});

test('blocks Start workflow for a trigger the shop cannot use yet', async ({
  page,
  context,
  baseURL,
}) => {
  const { headers } = await signIn(context, baseURL!);
  const db = createDatabase(process.env.DATABASE_ADMIN_URL!);
  const evidence = process.env.CAMP6_CANVAS_EVIDENCE;
  if (evidence) await mkdir(evidence, { recursive: true });
  const created = await context.request.post('/api/automations', {
    headers,
    data: { name: 'Not ready yet', templateKey: 'back_in_stock' },
  });
  const { id } = (await created.json()) as { id: string };
  try {
    await page.goto(`/automations/${id}/canvas`);
    const checks = page.getByRole('region', { name: 'Workflow checks' });
    await expect(checks.getByText(/cannot use yet/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start workflow' })).toBeDisabled();
    await captureEvidence(page, evidence, 'readiness');
  } finally {
    await db.pool.query('delete from automations where id=$1', [id]);
    await db.pool.end();
  }
});

// The canvas re-centres while the page and its panels finish loading, so measure once it is still.
async function stableBox(locator: Locator) {
  let last = await locator.boundingBox();
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await locator.page().waitForTimeout(150);
    const next = await locator.boundingBox();
    if (last && next && Math.abs(next.x - last.x) < 0.5 && Math.abs(next.y - last.y) < 0.5)
      return next;
    last = next;
  }
  throw new Error('The canvas did not settle');
}

test('pans, zooms and fits the canvas like a design tool', async ({ page, context, baseURL }) => {
  const { headers } = await signIn(context, baseURL!);
  const db = createDatabase(process.env.DATABASE_ADMIN_URL!);
  const created = await context.request.post('/api/automations', {
    headers,
    data: { name: 'Move around the canvas', templateKey: 'welcome_new_subscriber' },
  });
  const { id } = (await created.json()) as { id: string };
  try {
    await page.goto(`/automations/${id}/canvas`);
    const canvas = page.getByRole('region', { name: 'Workflow canvas' });
    const trigger = page.getByRole('list', { name: 'Workflow steps' }).getByText('Trigger', {
      exact: true,
    });
    await expect(trigger).toBeVisible();
    const before = await stableBox(trigger);
    const frame = (await canvas.boundingBox())!;

    // Dragging empty background moves the flow by the drag distance.
    const startX = frame.x + 40;
    const startY = frame.y + frame.height / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 80, startY + 40, { steps: 6 });
    await page.mouse.up();
    const panned = (await trigger.boundingBox())!;
    expect(Math.abs(panned.x - before.x - 80)).toBeLessThan(2);
    expect(Math.abs(panned.y - before.y - 40)).toBeLessThan(2);

    // Ctrl + wheel zooms around the pointer: the spot under it stays put.
    const cursorX = panned.x + 20;
    const cursorY = panned.y + 8;
    const share = (cursorX - panned.x) / panned.width;
    await page.mouse.move(cursorX, cursorY);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -100);
    await page.keyboard.up('Control');
    await expect
      .poll(async () => (await trigger.boundingBox())!.width)
      .toBeGreaterThan(panned.width);
    const zoomed = (await trigger.boundingBox())!;
    expect(Math.abs(cursorX - zoomed.x - share * zoomed.width)).toBeLessThan(2);

    // Fit to screen brings the whole flow back into view.
    await page.getByRole('button', { name: 'Fit to screen' }).click();
    const steps = (await page.getByRole('list', { name: 'Workflow steps' }).boundingBox())!;
    expect(steps.x).toBeGreaterThanOrEqual(frame.x);
    expect(steps.y).toBeGreaterThanOrEqual(frame.y);
    expect(steps.x + steps.width).toBeLessThanOrEqual(frame.x + frame.width);
    expect(steps.y + steps.height).toBeLessThanOrEqual(frame.y + frame.height);

    // A click on a step still opens it, and a palette drop still adds a step at 50% zoom.
    await page.getByRole('button', { name: 'Edit step 1' }).click();
    await expect(page).toHaveURL(/step=/);
    await page.getByRole('button', { name: 'Done' }).click();
    const zoom = page.getByRole('status').filter({ hasText: '%' });
    while ((await zoom.innerText()) !== '50%') {
      await page.getByRole('button', { name: 'Zoom out' }).click();
      await page.waitForTimeout(50);
    }
    const waits = page.getByRole('list', { name: 'Workflow steps' }).getByText('Wait for');
    const waitsBefore = await waits.count();
    await page
      .getByRole('button', { name: 'Delay' })
      .dragTo(page.getByRole('button', { name: 'Add a step here' }).first());
    await expect(waits).toHaveCount(waitsBefore + 1);
  } finally {
    await db.pool.query('delete from automations where id=$1', [id]);
    await db.pool.end();
  }
});

test('keeps the view after a reload and pans from a step', async ({ page, context, baseURL }) => {
  const { headers } = await signIn(context, baseURL!);
  const db = createDatabase(process.env.DATABASE_ADMIN_URL!);
  const created = await context.request.post('/api/automations', {
    headers,
    data: { name: 'Pan from a step', templateKey: 'welcome_new_subscriber' },
  });
  const { id } = (await created.json()) as { id: string };
  try {
    await page.goto(`/automations/${id}/canvas`);
    const trigger = page.getByRole('list', { name: 'Workflow steps' }).getByText('Trigger', {
      exact: true,
    });
    const step = page.getByRole('button', { name: 'Edit step 1' });
    await expect(trigger).toBeVisible();

    // A long drag that starts on a step pans and does not open the step.
    const start = await stableBox(trigger);
    const box = (await step.boundingBox())!;
    await page.mouse.move(box.x + 20, box.y + 10);
    await page.mouse.down();
    await page.mouse.move(box.x + 120, box.y + 10, { steps: 6 });
    await page.mouse.up();
    expect(Math.abs((await trigger.boundingBox())!.x - start.x - 100)).toBeLessThan(2);
    await expect(page).not.toHaveURL(/step=/);

    // Space + drag pans even while a step has focus, as it does after a panel closes.
    await step.click();
    await page.getByRole('button', { name: 'Done' }).click();
    await step.focus();
    const before = (await trigger.boundingBox())!;
    const point = (await step.boundingBox())!;
    await page.mouse.move(point.x + 20, point.y + 10);
    await page.keyboard.down('Space');
    await page.mouse.down();
    await page.mouse.move(point.x + 20, point.y + 70, { steps: 4 });
    await page.mouse.up();
    await page.keyboard.up('Space');
    expect(Math.abs((await trigger.boundingBox())!.y - before.y - 60)).toBeLessThan(2);

    // The moved view comes back after a reload.
    await page.waitForTimeout(400);
    const moved = (await trigger.boundingBox())!;
    await page.reload();
    await expect(trigger).toBeVisible();
    const restored = (await trigger.boundingBox())!;
    expect(Math.abs(restored.x - moved.x)).toBeLessThan(2);
    expect(Math.abs(restored.y - moved.y)).toBeLessThan(2);
  } finally {
    await db.pool.query('delete from automations where id=$1', [id]);
    await db.pool.end();
  }
});
