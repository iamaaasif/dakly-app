// Fails when the Drizzle schema and the migrations disagree: generating from the
// schema must leave packages/db as it was. Comparing before and after lets
// uncommitted work pass when its migration is already generated. See docs/rules/database.md.
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

function readDatabasePackageStatus() {
  return execFileSync('git', ['status', '--porcelain', 'packages/db'], {
    cwd: root,
    encoding: 'utf8',
  });
}

// The schema imports @dakly/contracts from dist, and drizzle-kit exits 0 when that import
// fails, so a missing build would pass silently.
execFileSync('pnpm', ['exec', 'turbo', 'run', 'build', '--filter=@dakly/db^...'], {
  cwd: root,
  stdio: 'inherit',
});
const statusBefore = readDatabasePackageStatus();
execFileSync('pnpm', ['--filter', '@dakly/db', 'db:generate'], { cwd: root, stdio: 'inherit' });
const statusAfter = readDatabasePackageStatus();

if (statusAfter !== statusBefore) {
  console.error(
    [
      '',
      'The schema and migrations disagree. Generating from the schema changed packages/db:',
      statusAfter.trimEnd(),
      '',
      'Run `pnpm --filter @dakly/db db:generate --name <what-it-does>`, review the SQL and commit the migration.',
    ].join('\n'),
  );
  process.exit(1);
}
