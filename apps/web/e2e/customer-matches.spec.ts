import { randomInt, randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';

import { createDatabase } from '@dakly/db/client';

test.use({ screenshot: 'off' });

test('shows a possible same person on the profile and dismisses it', async ({
  page,
  context,
  baseURL,
}) => {
  const fixture = JSON.parse(process.env.BROWSER_FIXTURE!) as {
    token: string;
    storeIds: [string, string];
  };
  const database = createDatabase(process.env.DATABASE_ADMIN_URL!);
  const [shop] = fixture.storeIds;
  const phone = `017${randomInt(10000000, 99999999)}`;
  const [owner, chat] = [randomUUID(), randomUUID()];
  try {
    await database.pool.query(
      `insert into contacts(id,store_id,name,phone,source,kind) values
         ($2,$1,'করিম উদ্দিন',$4,'manual','customer'),
         ($3,$1,'রহিমা আক্তার',null,'messenger','chat_only')`,
      [shop, owner, chat, phone],
    );
    await database.pool.query(
      `insert into contact_match_suggestions(id,store_id,contact_id,matched_contact_id,reason,phone)
       values(gen_random_uuid(),$1,$2,$3,'same_phone',$4)`,
      [shop, chat, owner, phone],
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
    const selected = await context.request.post('/api/me/active-store', {
      headers: { Origin: baseURL! },
      data: { storeId: shop },
    });
    expect(selected.status()).toBe(204);

    await page.goto(`/customers/${chat}`);
    const note = page.getByRole('heading', { name: 'Possible same person' });
    await expect(note).toBeVisible();
    await page.getByRole('button', { name: 'Possible same person' }).click();
    await expect(page.getByRole('link', { name: 'করিম উদ্দিন' })).toBeVisible();
    await expect(page.getByText(/shares a phone number/)).toBeVisible();

    await page.evaluate(async () => document.fonts.ready);
    const evidence = process.env.CUS4_EVIDENCE;
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
        await page.screenshot({ path: resolve(evidence, `profile-note-${width}x${height}.png`) });
    }

    await page.getByRole('button', { name: 'Dismiss' }).click();
    await expect(note).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'রহিমা আক্তার', level: 1 })).toBeVisible();
    await expect(note).toHaveCount(0);

    await page.goto(`/customers/${owner}`);
    await expect(page.getByRole('heading', { name: 'করিম উদ্দিন', level: 1 })).toBeVisible();
    await expect(note).toHaveCount(0);
  } finally {
    await database.pool.query('delete from contacts where store_id=$1 and id=any($2)', [
      shop,
      [owner, chat],
    ]);
    await database.pool.end();
  }
});

test('merges two customers from the profile and undoes it', async ({ page, context, baseURL }) => {
  const fixture = JSON.parse(process.env.BROWSER_FIXTURE!) as {
    token: string;
    storeIds: [string, string];
  };
  const database = createDatabase(process.env.DATABASE_ADMIN_URL!);
  const [shop] = fixture.storeIds;
  const phone = `017${randomInt(10000000, 99999999)}`;
  const [older, newer] = [randomUUID(), randomUUID()];
  try {
    await database.pool.query(
      `insert into contacts(id,store_id,name,phone,source,kind,created_at) values
         ($2,$1,'করিম উদ্দিন',$4,'manual','customer','2026-11-01T00:00:00Z'),
         ($3,$1,'রহিমা আক্তার',null,'messenger','chat_only','2026-11-10T00:00:00Z')`,
      [shop, older, newer, phone],
    );
    await database.pool.query(
      `insert into contact_match_suggestions(id,store_id,contact_id,matched_contact_id,reason,phone)
       values(gen_random_uuid(),$1,$2,$3,'same_phone',$4)`,
      [shop, newer, older, phone],
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
    const selected = await context.request.post('/api/me/active-store', {
      headers: { Origin: baseURL! },
      data: { storeId: shop },
    });
    expect(selected.status()).toBe(204);

    const evidence = process.env.CUS14_EVIDENCE;
    if (evidence) await mkdir(evidence, { recursive: true });
    const capture = async (name: string) => {
      await page.evaluate(async () => document.fonts.ready);
      for (const [width, height] of [
        [1440, 900],
        [360, 800],
      ] as const) {
        await page.setViewportSize({ width, height });
        await expect
          .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
          .toBe(true);
        if (evidence)
          await page.screenshot({ path: resolve(evidence, `${name}-${width}x${height}.png`) });
      }
    };

    await page.goto(`/customers/${newer}`);
    await expect(page.getByRole('heading', { name: 'Possible same person' })).toBeVisible();
    await page.getByRole('button', { name: 'Possible same person' }).click();
    await capture('profile-merge-button');

    await page.getByRole('button', { name: 'Merge', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Merge করিম উদ্দিন?' })).toBeVisible();
    await capture('merge-confirm');

    await page.getByRole('button', { name: 'Merge customers' }).click();
    await expect(page).toHaveURL(new RegExp(`/customers/${older}$`));
    await expect(page.getByRole('heading', { name: 'করিম উদ্দিন', level: 1 })).toBeVisible();
    await expect(page.getByText('Merged with রহিমা আক্তার')).toBeVisible();
    await capture('kept-profile-undo');

    await page.getByRole('button', { name: 'Undo merge' }).click();
    await expect(page).toHaveURL(new RegExp(`/customers/${newer}$`));
    await expect(page.getByRole('heading', { name: 'রহিমা আক্তার', level: 1 })).toBeVisible();
    await page.goto(`/customers/${older}`);
    await expect(page.getByText('Merged with রহিমা আক্তার')).toHaveCount(0);
  } finally {
    await database.pool.query('delete from contact_merges where store_id=$1', [shop]);
    await database.pool.query('delete from contacts where store_id=$1 and id=any($2)', [
      shop,
      [older, newer],
    ]);
    await database.pool.end();
  }
});
