// Fails when the Drizzle schema and the committed migrations disagree: generating
// from the schema must leave packages/db unchanged. See docs/rules/database.md.
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

execFileSync('pnpm', ['--filter', '@dakly/db', 'db:generate'], { cwd: root, stdio: 'inherit' });

const changes = execFileSync('git', ['status', '--porcelain', 'packages/db'], {
  cwd: root,
  encoding: 'utf8',
});

if (changes.trim() !== '') {
  console.error(
    [
      '',
      'The schema and migrations disagree. Generating from the schema changed packages/db:',
      changes.trimEnd(),
      '',
      'Run `pnpm --filter @dakly/db db:generate --name <what-it-does>`, review the SQL and commit the migration.',
    ].join('\n'),
  );
  process.exit(1);
}
