import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { browserFixture } from './browser-fixture.mjs';
import { requireFreePort, startProcess, stopProcess, waitForHealth } from './browser-process.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const web = `${root}apps/web`;
const artifacts = `${web}/e2e-artifacts`;
const requireWeb = createRequire(`${web}/package.json`);
const apiOrigin = 'http://127.0.0.1:4015';
const webOrigin = 'http://localhost:3015';
const controller = new AbortController();
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => controller.abort());
const processes = [];

function localService(name) {
  let url;
  try {
    url = new URL(process.env[name]);
  } catch {
    throw new Error(`${name} is required`);
  }
  const protocols = name === 'REDIS_URL' ? ['redis:', 'rediss:'] : ['postgres:', 'postgresql:'];
  // pg accepts query host overrides, so a loopback authority alone is not sufficient.
  if (
    url.search ||
    !protocols.includes(url.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  )
    throw new Error(`${name} must use a dedicated loopback test service without URL query options`);
  return url.href;
}

function start(command, args, name, env, cwd = root) {
  controller.signal.throwIfAborted();
  const process = startProcess(command, args, { cwd, env, log: `${artifacts}/${name}.log` });
  processes.push(process);
  return process;
}

async function run(command, args, name, env, cwd) {
  const running = start(command, args, name, env, cwd);
  const code = await Promise.race([
    running.done,
    new Promise((_, reject) =>
      controller.signal.addEventListener(
        'abort',
        () => reject(new Error('Browser test cancelled')),
        { once: true },
      ),
    ),
  ]);
  if (code !== 0) throw new Error(`${name} failed; inspect apps/web/e2e-artifacts/${name}.log`);
}

function apiEnvironment(environment, publicKey) {
  return {
    ...environment,
    NODE_ENV: 'test',
    API_PORT: '4015',
    API_HOST: '127.0.0.1',
    WEB_ORIGINS: webOrigin,
    ADMIN_ORIGIN: 'http://admin.localhost:3010',
    API_TRUSTED_PROXIES: '127.0.0.1,::1',
    STAFF_SESSION_SIGNING_KEY: randomBytes(32).toString('base64'),
    CLOUDFLARE_ACCESS_ISSUER: 'https://browser-fixture.cloudflareaccess.com',
    CLOUDFLARE_ACCESS_AUDIENCE: 'browser-fixture',
    CLOUDFLARE_ACCESS_DEVELOPMENT_JWKS: JSON.stringify({
      keys: [{ ...publicKey.export({ format: 'jwk' }), alg: 'RS256', kid: 'browser-fixture' }],
    }),
    ENCRYPTION_CURRENT_KEY_VERSION: '1',
    ENCRYPTION_MASTER_KEYS: JSON.stringify({ 1: randomBytes(32).toString('base64') }),
    SMS_DRIVER: 'mailpit',
    EMAIL_DRIVER: 'smtp',
    EMAIL_FROM: 'browser@example.test',
    GOOGLE_IDENTITY_DRIVER: undefined,
    GOOGLE_CLIENT_ID: undefined,
    SENDGRID_API_KEY: undefined,
    SLACK_BOT_TOKEN: undefined,
    SENTRY_DSN: undefined,
  };
}

async function main() {
  localService('DATABASE_URL');
  localService('REDIS_URL');
  const databaseUrl = localService('DATABASE_ADMIN_URL');
  if (!['localhost', '127.0.0.1', '::1'].includes(process.env.MAILPIT_SMTP_HOST ?? '127.0.0.1'))
    throw new Error('MAILPIT_SMTP_HOST must use a loopback test service');
  const mailpit = new URL(process.env.MAILPIT_API_URL);
  if (
    mailpit.protocol !== 'http:' ||
    !['localhost', '127.0.0.1', '[::1]'].includes(mailpit.hostname) ||
    mailpit.username ||
    mailpit.password ||
    mailpit.search ||
    mailpit.hash
  )
    throw new Error('MAILPIT_API_URL must use a dedicated loopback test service');
  await Promise.all([requireFreePort(4015), requireFreePort(3015)]);
  for (const directory of [artifacts, `${web}/test-results`, `${web}/playwright-report`])
    await rm(directory, { recursive: true, force: true });
  await mkdir(artifacts, { recursive: true });
  const environment = {
    ...process.env,
    WEB_API_URL: apiOrigin,
    WEB_TERMS_URL: 'https://legal.browser.test/terms',
    WEB_PRIVACY_URL: 'https://legal.browser.test/privacy',
    WEB_TERMS_VERSION: 'browser-fixture-v1',
    WEB_GOOGLE_CLIENT_ID: undefined,
  };
  let fixture;
  try {
    await run(
      'pnpm',
      ['exec', 'turbo', 'run', 'build', '--filter=@dakly/api', '--filter=@dakly/web'],
      'build',
      environment,
    );
    await Promise.all([requireFreePort(4015), requireFreePort(3015)]);
    await run('pnpm', ['test:native-forms'], 'native-forms', environment);
    const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const apiEnv = apiEnvironment(environment, publicKey);
    fixture = browserFixture(databaseUrl, mailpit.origin, apiEnv, privateKey);
    await fixture.seed();
    const api = start(process.execPath, [`${root}apps/api/dist/main.js`], 'api', apiEnv);
    const next = start(
      process.execPath,
      [
        requireWeb.resolve('next/dist/bin/next'),
        'start',
        '--port',
        '3015',
        '--hostname',
        '127.0.0.1',
      ],
      'next',
      { ...environment, NODE_ENV: 'production' },
      web,
    );
    await waitForHealth(`${apiOrigin}/health`, [api, next], controller.signal);
    await waitForHealth(`${webOrigin}/api/health`, [api, next], controller.signal);
    await run(
      process.execPath,
      [requireWeb.resolve('@playwright/test/cli'), 'test', ...process.argv.slice(2)],
      'playwright',
      {
        ...environment,
        // Playwright workers explicitly enable color; avoid a conflicting inherited override.
        NO_COLOR: undefined,
        BROWSER_FIXTURE: JSON.stringify(fixture.browser),
      },
      web,
    );
    console.log('Browser test passed. Results: apps/web/playwright-report');
  } finally {
    try {
      await Promise.all(processes.map(stopProcess));
    } finally {
      await fixture?.close();
    }
    await writeFile(
      `${artifacts}/cleanup.log`,
      'Owned processes stopped; fixture users and stores removed.\n',
    );
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
