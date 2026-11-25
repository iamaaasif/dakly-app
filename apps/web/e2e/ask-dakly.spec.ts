import { expect, test } from '@playwright/test';

import type { AskDaklyAnswer } from '@dakly/contracts/assistant';

test.use({ screenshot: 'off' });

test('asks Dakly AI from the header on the dashboard', async ({
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
  const { contextTag } = await (await context.request.get('/api/me/context')).json();

  // The fake model has no script here, so the answer is saved; the API side is covered by its own tests.
  const answer: AskDaklyAnswer = {
    kind: 'answer',
    text: 'You sold ৳3,42,800 from 904 orders in the last 30 days, up 18.4% on the 30 days before.',
    sources: ['Orders, last 30 days'],
    creditsLeft: 24,
  };
  const asked: unknown[] = [];
  await page.route('**/api/assistant/messages', async (route) => {
    asked.push(route.request().postDataJSON());
    await new Promise((release) => setTimeout(release, 400));
    await route.fulfill({ json: answer, headers: { 'x-session-context': contextTag } });
  });

  await page.goto('/dashboard');
  for (const [width, height] of [
    [1440, 900],
    [360, 800],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.screenshot({ path: testInfo.outputPath(`header-${width}.png`) });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: 'Ask Dakly AI' }).click();
  await expect(page).toHaveURL(/ask=open/);
  const panel = page.getByRole('complementary', { name: 'Dakly AI' });
  await expect(panel.getByText('Knows you’re on Dashboard')).toBeVisible();

  for (const [width, height] of [
    [1440, 900],
    [360, 800],
  ] as const) {
    await page.setViewportSize({ width, height });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`welcome-${width}.png`) });
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await panel.getByRole('button', { name: 'Explain my campaign performance' }).click();
  await expect(panel.getByText('Reading your shop’s reports…')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('reading-1440.png') });
  await expect(panel.getByText(answer.kind === 'answer' ? answer.text : '')).toBeVisible();
  await expect(panel.getByText('From Orders, last 30 days')).toBeVisible();
  expect(asked).toEqual([{ question: 'Explain my campaign performance', history: [] }]);
  for (const [width, height] of [
    [1440, 900],
    [360, 800],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.screenshot({ path: testInfo.outputPath(`answer-${width}.png`) });
  }

  await panel.getByRole('button', { name: 'Close' }).click();
  await expect(panel).toBeHidden();
  await expect(page).not.toHaveURL(/ask=open/);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: 'Ask Dakly AI' }).click();
  await panel.getByRole('textbox', { name: 'Ask Dakly AI' }).fill('Which product sells best?');
  await panel.getByRole('button', { name: 'Send' }).click();
  await expect(panel.getByText(answer.text, { exact: true })).toHaveCount(2);
  // The conversation survives closing and reopening the panel.
  expect(asked).toMatchObject([
    { question: 'Explain my campaign performance', history: [] },
    { question: 'Which product sells best?', history: [{}, {}] },
  ]);
});
