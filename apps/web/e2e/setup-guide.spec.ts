import { expect, test } from '@playwright/test';

test('shows the three setup cards and their destinations on the dashboard', async ({
  page,
  context,
  baseURL,
}, testInfo) => {
  const fixture = JSON.parse(process.env.BROWSER_FIXTURE!) as {
    token: string;
    storeIds: [string, string];
  };
  await context.addCookies([
    { name: 'dakly_session', value: fixture.token, url: baseURL!, httpOnly: true, sameSite: 'Lax' },
  ]);
  expect(
    (
      await context.request.post('/api/me/active-store', {
        data: { storeId: fixture.storeIds[0] },
        headers: { Origin: baseURL! },
      })
    ).status(),
  ).toBe(204);

  await page.goto('/dashboard');
  const guide = page.getByRole('region', { name: 'Get started in 3 steps' });
  await expect(guide.getByText('0 of 3 done')).toBeVisible();
  await expect(guide.getByRole('heading', { level: 3 })).toHaveText([
    'Add store details',
    'Connect a channel',
    'Create your first product',
  ]);
  for (const [name, href] of [
    ['Add store details', '/settings?tab=store'],
    ['Connect a channel', '/integrations'],
    ['Create your first product', '/products/new'],
  ]) {
    await expect(guide.getByRole('link', { name })).toHaveAttribute('href', href);
  }
  await expect(page.getByRole('heading', { name: 'How do you sell?' })).toHaveCount(0);

  for (const [width, height, columns] of [
    [1440, 900, 3],
    [360, 800, 1],
  ] as const) {
    await page.setViewportSize({ width, height });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    const layout = guide.getByRole('list', { name: 'Setup steps' });
    expect(
      await layout.evaluate((list) => getComputedStyle(list).gridTemplateColumns.split(' ').length),
    ).toBe(columns);
    await guide.screenshot({ path: testInfo.outputPath(`setup-guide-${width}.png`) });
  }

  await guide.getByRole('link', { name: 'Add store details' }).click();
  await page.getByRole('textbox', { name: 'Business type' }).fill('Clothing');
  await page.getByRole('textbox', { name: 'District' }).fill('Dhaka');
  await page.getByRole('button', { name: 'Save store information' }).click();
  await expect(page.getByText('Store information saved.')).toBeVisible();
  await page.goBack();
  await expect(guide.getByText('1 of 3 done')).toBeVisible();
});
