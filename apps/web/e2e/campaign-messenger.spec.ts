import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import type { CampaignResponse } from '@dakly/contracts/campaigns';
import { createDatabase } from '@dakly/db/client';

async function capture(page: Page, screen: string) {
  const evidence = process.env.CAMP7_SCREENSHOT_DIR;
  if (evidence) await mkdir(evidence, { recursive: true });
  for (const [width, height] of [
    [1440, 900],
    [360, 800],
  ] as const) {
    await page.setViewportSize({ width, height });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    if (evidence) await page.screenshot({ path: resolve(evidence, `${screen}-${width}.png`) });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

const picture = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320"><rect width="480" height="320" fill="#d9c7a3"/></svg>`;

test('builds a Messenger draft with an image and buttons', async ({ page, context, baseURL }) => {
  const fixture = JSON.parse(process.env.BROWSER_FIXTURE!) as {
    token: string;
    storeIds: [string, string];
  };
  const database = createDatabase(process.env.DATABASE_ADMIN_URL!);
  const storeId = fixture.storeIds[0];
  const pageId = randomUUID();
  const contacts = { open: randomUUID(), closed: randomUUID(), unknown: randomUUID() };
  await context.addCookies([
    { name: 'dakly_session', value: fixture.token, url: baseURL!, httpOnly: true, sameSite: 'Lax' },
  ]);
  await page.route('https://shop.example/**', (route) =>
    route.fulfill({ contentType: 'image/svg+xml', body: picture }),
  );
  try {
    await database.pool.query(
      `insert into channel_connections(id,store_id,kind,external_account_id,display_name,status)
       values($1,$2,'facebook_page','3001001','Nusrat Urban Trend','active')`,
      [pageId, storeId],
    );
    for (const [name, id] of Object.entries(contacts)) {
      await database.pool.query(
        "insert into contacts(id,store_id,name,source,kind,district) values($1,$2,$3,'messenger','customer','Dhaka')",
        [id, storeId, `Messenger ${name}`],
      );
      await database.pool.query(
        "insert into consents(id,store_id,contact_id,channel,status,source) values(gen_random_uuid(),$1,$2,'messenger','granted','checkout')",
        [storeId, id],
      );
    }
    for (const [id, psid, hours] of [
      [contacts.open, 'psid-e2e-open', 2],
      [contacts.closed, 'psid-e2e-closed', 30],
    ] as const) {
      await database.pool.query(
        "insert into contact_identities(id,store_id,contact_id,channel_connection_id,channel,external_id) values(gen_random_uuid(),$1,$2,$3,'messenger',$4)",
        [storeId, id, pageId, psid],
      );
      await database.pool.query(
        "insert into conversations(id,store_id,contact_id,channel_connection_id,channel,last_inbound_at) values(gen_random_uuid(),$1,$2,$3,'messenger', now() - make_interval(hours => $4))",
        [storeId, id, pageId, hours],
      );
    }
    async function send(method: 'post' | 'patch', path: string, data: unknown) {
      const session = await (await context.request.get('/api/me/context')).json();
      return context.request[method](`/api${path}`, {
        data,
        headers: { Origin: baseURL!, 'X-Session-Context': session.contextTag },
      });
    }
    expect((await send('post', '/me/active-store', { storeId })).status()).toBe(204);
    // The builder has no audience step yet, so the segment is set through the API.
    const segment = await send('post', '/segments', {
      name: 'Dhaka customers',
      rules: {
        match: 'all',
        conditions: [{ field: 'district', operator: 'is_any_of', values: ['Dhaka'] }],
      },
    });
    expect(segment.status()).toBe(201);
    const segmentId: string = (await segment.json()).id;

    await page.goto('/campaigns/new');
    await expect(page.getByText('Connect first', { exact: true })).toHaveCount(2);
    await capture(page, 'channels');
    await page.getByRole('button', { name: 'Create Messenger message' }).click();
    await expect(page.getByLabel('Facebook Page')).toHaveValue(pageId);
    await page.getByLabel('Campaign name').fill('Eid offer');
    await page.getByText('Seasonal campaign', { exact: true }).click();
    const created = page.waitForResponse(
      (result) => result.url().endsWith('/api/campaigns') && result.status() === 201,
    );
    await page.getByRole('button', { name: 'Save draft' }).click();
    const draft: CampaignResponse = await (await created).json();
    expect(draft).toMatchObject({ channel: 'messenger', channelConnectionId: pageId });
    await expect(page).toHaveURL(new RegExp(`/campaigns/${draft.id}$`));

    expect(
      (await send('patch', `/campaigns/${draft.id}`, { includeSegmentIds: [segmentId] })).status(),
    ).toBe(200);
    await page.reload();
    await expect(page.getByLabel('Campaign name')).toHaveValue('Eid offer');
    await capture(page, 'goal-step');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page).toHaveURL(/step=content$/);
    const estimate = page.getByRole('region', { name: 'Estimate' });
    await expect(estimate).toContainText('Will receive');
    await expect(estimate).toContainText('Messenger only allows a message');
    await page.getByLabel(/Image link/).fill('https://shop.example/eid.jpg');
    await page
      .getByLabel('Message', { exact: true })
      .fill('Eid sale starts today. Free delivery in Dhaka.');
    await page.getByRole('button', { name: 'Add button' }).click();
    await page.getByLabel('Button 1', { exact: true }).fill('See offers');
    await page.getByRole('button', { name: 'Add button' }).click();
    await page.getByLabel('Button 2', { exact: true }).fill('Ask a question');
    const preview = page.getByRole('region', { name: 'Message preview' });
    await expect(preview).toContainText('Nusrat Urban Trend');
    await expect(preview).toContainText('Eid sale starts today.');
    await expect(preview).toContainText('See offers');
    await expect(preview.getByRole('img')).toBeVisible();
    const saved = page.waitForRequest(
      (request) =>
        request.method() === 'PATCH' && request.url().endsWith(`/api/campaigns/${draft.id}`),
    );
    await page.getByRole('button', { name: 'Save draft' }).click();
    expect((await saved).postDataJSON()).toEqual({
      content: {
        text: 'Eid sale starts today. Free delivery in Dhaka.',
        imageUrl: 'https://shop.example/eid.jpg',
        buttons: [{ title: 'See offers' }, { title: 'Ask a question' }],
      },
    });
    await expect(page.getByText('Draft saved.', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('Button 2', { exact: true })).toHaveValue('Ask a question');
    await expect(estimate).toContainText('last wrote more than 23 hours ago');
    await capture(page, 'builder');
    await page.getByLabel('Button 2', { exact: true }).fill('');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByLabel('Button 2', { exact: true })).toHaveAccessibleDescription(
      'Enter the button text.',
    );
    await expect(page.getByLabel('Button 2', { exact: true })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  } finally {
    await database.pool.query('delete from campaigns where store_id=$1', [storeId]);
    await database.pool.query('delete from segments where store_id=$1', [storeId]);
    await database.pool.query('delete from conversations where store_id=$1', [storeId]);
    await database.pool.query('delete from contacts where id = any($1::uuid[])', [
      Object.values(contacts),
    ]);
    await database.pool.query('delete from channel_connections where id=$1', [pageId]);
    await database.pool.end();
  }
});
