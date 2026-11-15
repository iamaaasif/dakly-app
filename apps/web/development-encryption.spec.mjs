import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('CI development encryption output', () => {
  it('registers the generated key as masked before later steps read the environment', () => {
    const directory = mkdtempSync(join(tmpdir(), 'dakly-ci-key-'));
    try {
      const target = join(directory, 'github-env');
      const output = execFileSync(
        process.execPath,
        ['../../scripts/development-encryption.mjs', '--ci'],
        {
          env: { ...process.env, NODE_ENV: 'test', GITHUB_ENV: target },
          encoding: 'utf8',
        },
      );
      const text = readFileSync(target, 'utf8');
      const encoded = text.match(/^ENCRYPTION_MASTER_KEYS=(.+)$/m)[1];
      const key = JSON.parse(encoded)['1'];
      // Only booleans enter assertion output; the generated material stays private.
      expect(output.includes(`::add-mask::${key}\n`)).toBe(true);
      expect(output.includes(`::add-mask::${encoded}\n`)).toBe(true);
      expect(Buffer.from(key, 'base64').length === 32).toBe(true);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
