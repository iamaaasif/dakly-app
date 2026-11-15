import { test, expect } from '@playwright/test';

test.use({ screenshot: 'off' });
test('keeps roles and the complete permission form usable at phone and desktop widths', async ({
  page,
  context,
  baseURL,
}) => {
  const { team } = JSON.parse(process.env.BROWSER_FIXTURE!) as { team: { token: string } };
  await context.addCookies([
    { name: 'dakly_session', value: team.token, url: baseURL!, httpOnly: true, sameSite: 'Lax' },
  ]);
  await page.goto('/team?tab=roles');
  const create = page.getByRole('button', { name: 'Create role', exact: true });
  await expect(create).toBeVisible();
  for (const width of [360, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: `e2e-artifacts/team-roles-${width}.png` });
    await create.click();
    const dialog = page.getByRole('dialog', { name: 'Create a custom role' });
    await expect(dialog).toBeVisible();
    await page.getByLabel('Role name').fill('Role layout draft');
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
    await page.screenshot({ path: `e2e-artifacts/team-role-form-${width}.png` });
    const save = dialog.getByRole('button', { name: 'Save role' });
    await save.scrollIntoViewIfNeeded();
    await expect(save).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(create).toBeFocused();
  }
});
