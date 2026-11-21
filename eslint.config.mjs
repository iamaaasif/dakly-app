import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import importX from 'eslint-plugin-import-x';
import reactHooks from 'eslint-plugin-react-hooks';
import sonarjs from 'eslint-plugin-sonarjs';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// The API runs on Fastify (ADR 0004); these only work on Express.
const expressPackages = [
  'express',
  '@nestjs/platform-express',
  'multer',
  'helmet',
  'cookie-parser',
  'express-session',
  'express-rate-limit',
  'body-parser',
];
const expressMessage = 'Express-only. Use the Fastify equivalent; see docs/rules/http-fastify.md.';

const restrictedSyntax = [
  {
    selector: 'TSEnumDeclaration',
    message: 'Use a string literal union or an `as const` object instead of a TypeScript enum.',
  },
  {
    // no-restricted-imports sees only static imports.
    selector: `ImportExpression:matches(${expressPackages.map((name) => `[source.value='${name}']`).join(', ')})`,
    message: expressMessage,
  },
];

const hexColour = '/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/';
const hexClass = '/\\[#[0-9a-fA-F]{3,8}\\]/';
const hexColourSyntax = [
  {
    selector: `:matches(Literal[value=${hexColour}], TemplateElement[value.raw=${hexColour}])`,
    message: 'Use a theme token, not a hex colour. See docs/rules/frontend-styling.md.',
  },
  {
    selector: `:matches(Literal[value=${hexClass}], TemplateElement[value.raw=${hexClass}])`,
    message: 'Use a theme token, not an arbitrary hex class. See docs/rules/frontend-styling.md.',
  },
];

// Web rules from docs/rules/frontend-*.md that a parser can see.
const webRestrictedSyntax = [
  ...hexColourSyntax,
  {
    selector: "CallExpression[callee.property.name='toLocaleString']",
    message: 'Format with lib/format-money or lib/format-date. See docs/rules/frontend-styling.md.',
  },
  {
    // Intl constructors also work when called without `new`.
    selector: ":matches(NewExpression, CallExpression)[callee.object.name='Intl']",
    message: 'Format with lib/format-money or lib/format-date. See docs/rules/frontend-styling.md.',
  },
];

const testFiles = ['**/*.spec.ts', '**/*.spec.tsx', '**/test/**', '**/e2e/**'];

// Tests may cast a partial fake; production code fixes the type instead.
const doubleAssertion = {
  selector:
    ":matches(TSAsExpression, TSTypeAssertion)[expression.type=/^TS(AsExpression|TypeAssertion)$/][expression.typeAnnotation.type='TSUnknownKeyword']",
  message: 'Do not cast through `as unknown as`. Fix the type, or parse the value with zod.',
};

// A file gets only the last no-restricted-syntax list that matches it, so each block that sets one
// is followed by a copy for non-test files that adds the `as unknown as` check.
function withProductionSyntax(block) {
  const [, ...selectors] = block.rules['no-restricted-syntax'];
  return [
    block,
    {
      files: block.files,
      ignores: [...(block.ignores ?? []), ...testFiles],
      rules: { 'no-restricted-syntax': ['error', ...selectors, doubleAssertion] },
    },
  ];
}

// Limits that keep code small and readable. See docs/rules/simplicity.md.
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/next-env.d.ts',
      // Broken on purpose; scripts/lint-rules.spec.mjs lints them with this config.
      'scripts/lint-fixtures/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...withProductionSyntax({
    files: ['**/*.{ts,tsx}'],
    plugins: { sonarjs, 'import-x': importX, '@stylistic': stylistic },
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': 'error',
      'max-depth': ['error', 3],
      complexity: ['error', 10],
      'max-lines-per-function': ['error', { max: 60, skipBlankLines: true, skipComments: true }],
      'max-lines': ['error', { max: 400, skipBlankLines: true, skipComments: true }],
      'sonarjs/cognitive-complexity': ['error', 15],
      'no-nested-ternary': 'error',
      '@stylistic/lines-between-class-members': [
        'error',
        'always',
        { exceptAfterSingleLine: true },
      ],
      'import-x/first': 'error',
      'import-x/newline-after-import': 'error',
      'import-x/no-duplicates': 'error',
      'import-x/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', ['parent', 'sibling', 'index']],
          // Workspace packages look like external scoped packages, so they need a path group.
          pathGroups: [
            { pattern: '@dakly/**', group: 'internal' },
            { pattern: '@/**', group: 'parent' },
          ],
          pathGroupsExcludedImportTypes: ['builtin'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'no-restricted-syntax': ['error', ...restrictedSyntax],
      'no-restricted-imports': [
        'error',
        {
          paths: expressPackages.map((name) => ({ name, message: expressMessage })),
          patterns: [
            {
              group: ['**/index', '**/index.ts'],
              message: 'Import the file directly. Barrel files are not used in this repo.',
            },
          ],
        },
      ],
    },
  }),
  {
    // Tests may be long and describe many cases.
    files: ['**/*.spec.ts', '**/*.spec.tsx', '**/test/**'],
    rules: {
      'max-lines-per-function': 'off',
      'max-lines': 'off',
    },
  },
  {
    // NestJS consumes these imports at runtime through decorator metadata.
    files: ['apps/api/**/*.ts', 'apps/worker/**/*.ts', 'packages/core/**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
  ...withProductionSyntax({
    // max-params cannot skip constructors, and NestJS constructors take injected dependencies.
    files: ['packages/core/src/**/*.ts', 'apps/api/src/**/*.ts', 'apps/worker/src/**/*.ts'],
    ignores: ['**/*.spec.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...restrictedSyntax,
        ...['FunctionDeclaration', 'ArrowFunctionExpression', 'FunctionExpression'].map((node) => ({
          selector: `${node}[params.length>4]:not(MethodDefinition[kind='constructor'] > FunctionExpression)`,
          message: 'Use one object parameter when a function needs more than 4 values.',
        })),
      ],
      '@typescript-eslint/no-non-null-assertion': 'warn',
    },
  }),
  ...withProductionSyntax({
    // NestJS binds one decorator to one handler parameter, so handlers cannot take one object.
    files: ['packages/core/src/**/*.controller.ts', 'apps/api/src/**/*.controller.ts'],
    rules: {
      'no-restricted-syntax': ['error', ...restrictedSyntax],
    },
  }),
  {
    // The model eval CLI prints its result tables to the terminal.
    files: ['packages/core/src/ai-eval/model-eval/eval-output.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    files: ['scripts/**/*.mjs', 'apps/web/*.spec.mjs'],
    languageOptions: { globals: { ...globals.node } },
    rules: { 'no-console': 'off' },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
  },
  ...withProductionSyntax({
    files: ['apps/{web,admin}/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser },
    },
    rules: {
      'max-params': ['error', 3],
      'no-restricted-syntax': ['error', ...restrictedSyntax, ...webRestrictedSyntax],
    },
  }),
  {
    files: ['apps/{web,admin}/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  ...withProductionSyntax({
    // Next.js needs default exports only from route files.
    files: ['apps/{web,admin}/src/**/*.{ts,tsx}'],
    ignores: ['apps/{web,admin}/src/app/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...restrictedSyntax,
        ...webRestrictedSyntax,
        {
          selector: 'ExportDefaultDeclaration',
          message: 'Use a named export. Default exports are only for Next.js route files.',
        },
      ],
    },
  }),
  ...withProductionSyntax({
    // The formatters are the one place allowed to call Intl.
    files: ['apps/{web,admin}/src/lib/format-*.ts'],
    rules: {
      'no-restricted-syntax': ['error', ...restrictedSyntax],
    },
  }),
  ...withProductionSyntax({
    files: ['packages/ui/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': ['error', ...restrictedSyntax, ...hexColourSyntax],
    },
  }),
  {
    // Last, so its no-restricted-syntax list is the one these files get.
    files: ['{apps,packages}/**/index.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Program',
          message: 'Name the file for what it holds. Barrel files are not used in this repo.',
        },
      ],
    },
  },
);
