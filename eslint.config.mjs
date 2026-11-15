import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import importX from 'eslint-plugin-import-x';
import sonarjs from 'eslint-plugin-sonarjs';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const restrictedSyntax = [
  {
    selector: 'TSEnumDeclaration',
    message: 'Use a string literal union or an `as const` object instead of a TypeScript enum.',
  },
];

// Web rules from docs/rules/frontend-*.md that a parser can see.
const webRestrictedSyntax = [
  {
    selector: 'Literal[value=/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/]',
    message: 'Use a theme token, not a hex colour. See docs/rules/frontend-styling.md.',
  },
  {
    selector: 'Literal[value=/\\[#[0-9a-fA-F]{3,8}\\]/]',
    message: 'Use a theme token, not an arbitrary hex class. See docs/rules/frontend-styling.md.',
  },
  {
    selector: "CallExpression[callee.property.name='toLocaleString']",
    message: 'Format with lib/format-money or lib/format-date. See docs/rules/frontend-styling.md.',
  },
  {
    selector: "NewExpression[callee.object.name='Intl']",
    message: 'Format with lib/format-money or lib/format-date. See docs/rules/frontend-styling.md.',
  },
];

// Limits that keep code small and readable. See docs/rules/simplicity.md.
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/next-env.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
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
          // The API runs on Fastify (ADR 0004); these only work on Express.
          paths: [
            'express',
            '@nestjs/platform-express',
            'multer',
            'helmet',
            'cookie-parser',
            'express-session',
            'express-rate-limit',
            'body-parser',
          ].map((name) => ({
            name,
            message: 'Express-only. Use the Fastify equivalent; see docs/rules/http-fastify.md.',
          })),
          patterns: [
            {
              group: ['**/index', '**/index.ts'],
              message: 'Import the file directly. Barrel files are not used in this repo.',
            },
          ],
        },
      ],
    },
  },
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
  {
    files: ['scripts/**/*.mjs', 'apps/web/*.spec.mjs'],
    languageOptions: { globals: { ...globals.node } },
    rules: { 'no-console': 'off' },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
  },
  {
    files: ['apps/{web,admin}/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser },
    },
    rules: {
      'max-params': ['error', 3],
      'no-restricted-syntax': ['error', ...restrictedSyntax, ...webRestrictedSyntax],
    },
  },
  {
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
  },
  {
    // The formatters are the one place allowed to call Intl.
    files: ['apps/{web,admin}/src/lib/format-*.ts'],
    rules: {
      'no-restricted-syntax': ['error', ...restrictedSyntax],
    },
  },
);
