import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));
const requireWeb = createRequire(`${root}apps/web/package.json`);
const { createElement } = requireWeb('react');
const { renderToStaticMarkup } = requireWeb('react-dom/server');
const { QueryClient, QueryClientProvider } = requireWeb('@tanstack/react-query');
const { chromium } = requireWeb('@playwright/test');
const modules = new Map();

// Render the actual source without hydration; resolve each app's own alias and shared runtime.
function sourceModule(file) {
  if (modules.has(file)) return modules.get(file).exports;
  const module = { exports: {} };
  modules.set(file, module);
  const localRequire = createRequire(file);
  const requireSource = (name) => {
    if (!name.startsWith('.') && !name.startsWith('@/')) {
      const resolved = localRequire.resolve(name);
      return /\.tsx?$/.test(resolved) ? sourceModule(resolved) : localRequire(name);
    }
    const app = file.includes('/apps/admin/') ? 'admin' : 'web';
    const base = name.startsWith('@/')
      ? resolve(root, `apps/${app}/src`, name.slice(2))
      : resolve(dirname(file), name);
    const target = ['.ts', '.tsx', '.js'].map((extension) => base + extension).find(existsSync);
    return target ? sourceModule(target) : localRequire(name);
  };
  const compiled = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: file,
  }).outputText;
  new Function('require', 'module', 'exports', compiled)(requireSource, module, module.exports);
  return module.exports;
}
const forms = [
  [
    'web',
    'sign-in-form',
    'SignInForm',
    { method: 'phone', isRemembered: false, onResult() {}, onRemember() {} },
  ],
  [
    'web',
    'sign-up-account',
    'SignUpAccount',
    {
      channel: 'sms',
      legal: {
        termsUrl: 'https://example.test/terms',
        privacyUrl: 'https://example.test/privacy',
        termsVersion: 'test',
      },
      onSent() {},
    },
  ],
  ['web', 'recovery-request', 'RecoveryRequest', {}],
  ['web', 'recovery-complete', 'RecoveryComplete', {}],
  ['admin', 'sign-in-screen', 'SignInScreen', {}],
  ['admin', 'enrollment-screen', 'EnrollmentScreen', {}],
];
const fakeValues = {
  name: 'Synthetic Person',
  identifier: '01712345678',
  phone: '01712345678',
  email: 'fake@example.test',
  password: 'fake-password-only123',
  proof: 'fake-enrollment-proof-only',
  token: 'fake-recovery-token-only',
  recoveryId: '11111111-1111-4111-8111-111111111111',
  phoneCode: '123456',
  emailCode: '654321',
};
const browser = await chromium.launch({ headless: true });
try {
  for (const [app, name, exported, props] of forms) {
    const component = sourceModule(`${root}apps/${app}/src/features/auth/components/${name}.tsx`)[
      exported
    ];
    const client = new QueryClient();
    const html = renderToStaticMarkup(
      createElement(QueryClientProvider, { client }, createElement(component, props)),
    );
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    let submitted;
    const url = `http://native-form.test/${app}/${name}`;
    await page.route('**/*', async (route) => {
      const request = route.request();
      if (request.url() !== url || request.method() !== 'GET' || submitted === false) {
        submitted = { method: request.method(), url: request.url(), body: request.postData() };
        await route.fulfill({
          status: 200,
          contentType: 'text/plain',
          body: 'Native submission received',
        });
      } else await route.fulfill({ status: 200, contentType: 'text/html', body: html });
    });
    await page.goto(url);
    for (const [field, value] of Object.entries(fakeValues)) {
      const input = page.locator(`input[name="${field}"]`);
      if (await input.count()) await input.fill(value);
    }
    for (const checkbox of await page.locator('input[type="checkbox"]').all())
      await checkbox.check();
    submitted = false;
    const navigation = page.waitForNavigation();
    if (name === 'sign-in-form') await page.locator('input[name="password"]').press('Enter');
    else await page.locator('button[type="submit"]').click();
    await navigation;
    assert.equal(submitted.method, 'POST', `${app}/${name} must use native POST`);
    assert.equal(
      new URL(submitted.url).search,
      '',
      `${app}/${name} must not serialize fields into its URL`,
    );
    assert.ok(submitted.body, `${app}/${name} submitted its fake fields in the request body`);
    await context.close();
    client.clear();
  }
} finally {
  await browser.close();
}
process.stdout.write(
  'Native public and staff forms: 6 no-JavaScript POST cases passed; no artifacts retained.\n',
);
