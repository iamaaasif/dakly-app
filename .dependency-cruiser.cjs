// Module boundary rules. See docs/rules/module-boundaries.md.
module.exports = {
  forbidden: [
    {
      name: 'no-cross-feature-internals',
      comment:
        'A core feature may use another feature only through its module or service. ' +
        'Repositories, jobs, listeners and private files stay inside their own feature.',
      severity: 'error',
      from: { path: '^packages/core/src/([^/]+)/' },
      to: {
        path: '^packages/core/src/([^/]+)/',
        pathNot: [
          '^packages/core/src/$1/',
          '^packages/core/src/platform/',
          '^packages/core/src/[^/]+/[^/]+\\.(module|service|events)\\.ts$',
        ],
      },
    },
    {
      name: 'platform-does-not-know-features',
      comment: 'platform/ is the base layer. Features depend on it, never the reverse.',
      severity: 'error',
      from: { path: '^packages/core/src/platform/' },
      to: { path: '^packages/core/src/(?!platform/)' },
    },
    {
      name: 'no-cross-feature-imports-in-web',
      comment:
        'A web feature never imports another feature. Move shared code to src/components or src/lib.',
      severity: 'error',
      from: { path: '^apps/(web|admin)/src/features/([^/]+)/' },
      to: {
        path: '^apps/(?:web|admin)/src/features/',
        pathNot: '^apps/$1/src/features/$2/',
      },
    },
    {
      name: 'contracts-stay-pure',
      comment: 'contracts is shared with the browser: zod and types only.',
      severity: 'error',
      from: { path: '^packages/contracts/' },
      to: { path: '^packages/(core|db|providers)/|^apps/' },
    },
    {
      name: 'db-only-from-repositories',
      comment: 'Only repositories and platform/database talk to the database package.',
      severity: 'error',
      from: {
        path: '^packages/core/src/',
        pathNot: ['\\.repository\\.ts$', '^packages/core/src/platform/database/', '\\.spec\\.ts$'],
      },
      to: { path: '^packages/db/|node_modules/drizzle-orm' },
    },
    {
      name: 'web-shared-code-does-not-know-features',
      comment:
        'apps/web/src/components and lib are shared by every feature, so they never import one. ' +
        'See docs/rules/frontend.md.',
      severity: 'error',
      from: { path: '^apps/(?:web|admin)/src/(components|lib)/' },
      to: { path: '^apps/(?:web|admin)/src/(features|app)/' },
    },
    {
      name: 'providers-do-not-know-core',
      comment:
        'Drivers translate vendor payloads only; business rules stay in core. See docs/rules/providers.md.',
      severity: 'error',
      from: { path: '^packages/providers/' },
      to: { path: '^packages/(core|db)/|^apps/' },
    },
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: ['node_modules', '(^|/)dist/'] },
    exclude: { path: '(^|/)\\.next/' },
    tsPreCompilationDeps: true,
    combinedDependencies: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
    },
  },
};
