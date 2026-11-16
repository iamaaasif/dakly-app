import { spawnSync } from 'node:child_process';
import { relative, resolve } from 'node:path';

import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

// Each fixture folder mirrors the repository layout, so running a tool from that folder applies the
// real config's path patterns to the fixtures. The repository ignore for scripts/lint-fixtures/
// names the folder from the repository root, so it does not apply from inside it.
const root = resolve(import.meta.dirname, '..');
const eslintFixtures = resolve(root, 'scripts/lint-fixtures/eslint');
const boundaryFixtures = resolve(root, 'scripts/lint-fixtures/boundaries');

const restrictedSyntax = {
  enum: 'Use a string literal union or an `as const` object instead of a TypeScript enum.',
  doubleAssertion:
    'Do not cast through `as unknown as`. Fix the type, or parse the value with zod.',
  objectParameter: 'Use one object parameter when a function needs more than 4 values.',
  defaultExport: 'Use a named export. Default exports are only for Next.js route files.',
  money: 'Format with lib/format-money or lib/format-date. See docs/rules/frontend-styling.md.',
  hexColour: 'Use a theme token, not a hex colour. See docs/rules/frontend-styling.md.',
  hexClass: 'Use a theme token, not an arbitrary hex class. See docs/rules/frontend-styling.md.',
  express: 'Express-only. Use the Fastify equivalent; see docs/rules/http-fastify.md.',
  indexFile: 'Name the file for what it holds. Barrel files are not used in this repo.',
};

// Files not listed must lint clean: they are the allowed side of a rule.
const expectedLintErrors = {
  'apps/api/src/express-dynamic-import.ts': [restrictedSyntax.express, restrictedSyntax.express],
  'apps/api/src/express-import.ts': ['no-restricted-imports'],
  'apps/web/src/components/conditional-hook.tsx': ['react-hooks/rules-of-hooks'],
  'apps/web/src/components/default-export.tsx': [restrictedSyntax.defaultExport],
  'apps/web/src/components/double-assertion.tsx': [restrictedSyntax.doubleAssertion],
  'apps/web/src/components/hex-class-template.tsx': [restrictedSyntax.hexClass],
  'apps/web/src/components/hex-class.tsx': [restrictedSyntax.hexClass],
  'apps/web/src/components/hex-colour-template.tsx': [restrictedSyntax.hexColour],
  'apps/web/src/components/hex-colour.tsx': [restrictedSyntax.hexColour],
  'apps/web/src/components/missing-dependency.tsx': ['react-hooks/exhaustive-deps'],
  'apps/web/src/components/money-intl-call.tsx': [restrictedSyntax.money],
  'apps/web/src/components/money-intl.tsx': [restrictedSyntax.money],
  'apps/web/src/components/money-locale.tsx': [restrictedSyntax.money],
  'apps/web/src/lib/many-params.ts': ['max-params'],
  'packages/contracts/src/angle-double-assertion.ts': [restrictedSyntax.doubleAssertion],
  'packages/contracts/src/any-type.ts': ['@typescript-eslint/no-explicit-any'],
  'packages/contracts/src/double-assertion.ts': [restrictedSyntax.doubleAssertion],
  'packages/contracts/src/enum.ts': [restrictedSyntax.enum],
  'packages/contracts/src/ts-ignore.ts': ['@typescript-eslint/ban-ts-comment'],
  'packages/core/src/orders/barrel-import.ts': ['no-restricted-imports'],
  'packages/core/src/orders/cognitive-complexity.ts': ['sonarjs/cognitive-complexity'],
  'packages/core/src/orders/complexity.ts': ['complexity'],
  'packages/core/src/orders/console.ts': ['no-console'],
  'packages/core/src/orders/index.ts': [restrictedSyntax.indexFile],
  'packages/core/src/orders/long-file.ts': ['max-lines'],
  'packages/core/src/orders/long-function.ts': ['max-lines-per-function'],
  'packages/core/src/orders/many-params.ts': [restrictedSyntax.objectParameter],
  'packages/core/src/orders/max-depth.ts': ['max-depth'],
  'packages/core/src/orders/nested-ternary.ts': ['no-nested-ternary'],
  'packages/ui/src/hex-class-template.tsx': [restrictedSyntax.hexClass],
  'packages/ui/src/hex-colour.tsx': [restrictedSyntax.hexColour],
};

const expectedBoundaryViolations = {
  'apps/web/src/components/customer-badge.tsx': ['web-shared-code-does-not-know-features-by-alias'],
  'apps/web/src/components/order-badge.tsx': ['web-shared-code-does-not-know-features'],
  'apps/web/src/features/orders/order-customer-alias.tsx': ['no-cross-feature-imports-in-web'],
  'apps/web/src/features/orders/order-customer.tsx': ['no-cross-feature-imports-in-web'],
  'apps/web/src/lib/orders.ts': ['web-apps-do-not-import-core-or-db'],
  'packages/contracts/src/money.ts': ['contracts-import-only-zod'],
  'packages/contracts/src/orders.spec.ts': ['contracts-stay-pure'],
  'packages/core/src/customers/customer-search.ts': ['db-only-from-repositories'],
  'packages/core/src/customers/customers.controller.ts': [
    'repositories-only-from-services-and-jobs',
  ],
  // dependency-cruiser reports a cycle once, from the first module it reaches.
  'packages/core/src/orders/order-lines.ts': ['no-circular'],
  'packages/core/src/orders/order-status.ts': ['no-barrel-imports'],
  'packages/core/src/orders/orders.service.ts': ['no-cross-feature-internals'],
  'packages/core/src/platform/clock.ts': ['platform-does-not-know-features'],
  'packages/providers/src/sms-driver.ts': ['providers-do-not-know-core'],
};

// The size limits need long sources, so these two fixtures are generated instead of committed.
const generatedSources = {
  'packages/core/src/orders/long-file.ts': Array.from(
    { length: 401 },
    (_, line) => `export const line${line} = ${line};`,
  ).join('\n'),
  'packages/core/src/orders/long-function.ts': [
    'export function countLines() {',
    '  let lines = 0;',
    ...Array.from({ length: 60 }, () => '  lines += 1;'),
    '  return lines;',
    '}',
  ].join('\n'),
};

describe('lint rules', () => {
  it('fails each invalid fixture with its own rule and passes the valid ones', async () => {
    const eslint = new ESLint({
      cwd: eslintFixtures,
      overrideConfigFile: resolve(root, 'eslint.config.mjs'),
    });
    const results = [
      ...(await eslint.lintFiles(['.'])),
      ...(
        await Promise.all(
          Object.entries(generatedSources).map(([path, source]) =>
            eslint.lintText(`${source}\n`, { filePath: resolve(eslintFixtures, path) }),
          ),
        )
      ).flat(),
    ];
    const found = Object.fromEntries(
      results
        .filter((result) => result.messages.length > 0)
        .map((result) => [
          relative(eslintFixtures, result.filePath),
          result.messages.map((message) =>
            message.ruleId === 'no-restricted-syntax' ? message.message : message.ruleId,
          ),
        ]),
    );

    expect(results.length).toBeGreaterThan(Object.keys(expectedLintErrors).length);
    expect(found).toEqual(expectedLintErrors);
  }, 60_000);

  it('fails each invalid boundary fixture with its own rule and passes the valid ones', () => {
    const cruise = spawnSync(
      process.execPath,
      [
        resolve(root, 'node_modules/dependency-cruiser/bin/dependency-cruiser.mjs'),
        'apps',
        'packages',
        '--config',
        resolve(root, '.dependency-cruiser.cjs'),
        '--output-type',
        'json',
      ],
      { cwd: boundaryFixtures, encoding: 'utf8' },
    );
    expect(cruise.stderr).toBe('');
    const report = JSON.parse(cruise.stdout);
    const found = {};
    for (const violation of report.summary.violations)
      found[violation.from] = [...(found[violation.from] ?? []), violation.rule.name];

    expect(report.modules.length).toBeGreaterThan(Object.keys(expectedBoundaryViolations).length);
    expect(found).toEqual(expectedBoundaryViolations);
  }, 60_000);
});
