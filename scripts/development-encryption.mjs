import { randomBytes } from 'node:crypto';
import { appendFileSync, chmodSync, existsSync, readFileSync } from 'node:fs';

if (process.env.NODE_ENV === 'production')
  throw new Error('Development keys cannot be generated in production');
const isCi = process.argv.includes('--ci');
const target = isCi ? process.env.GITHUB_ENV : '.env';
if (!target) throw new Error('CI environment file is required');
const existing = existsSync(target) ? readFileSync(target, 'utf8') : '';
const version = /^\s*(?:export\s+)?ENCRYPTION_CURRENT_KEY_VERSION=/m.test(existing);
const keys = /^\s*(?:export\s+)?ENCRYPTION_MASTER_KEYS=/m.test(existing);
if (version !== keys)
  throw new Error('Complete the existing encryption configuration before generating keys');
if (!keys) {
  if (!isCi && existsSync(target)) chmodSync(target, 0o600);
  const encoded = JSON.stringify({ 1: randomBytes(32).toString('base64') });
  const value = isCi ? encoded : `'${encoded}'`;
  appendFileSync(target, `\nENCRYPTION_CURRENT_KEY_VERSION=1\nENCRYPTION_MASTER_KEYS=${value}\n`, {
    mode: 0o600,
  });
}
