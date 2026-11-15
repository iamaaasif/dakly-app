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
      // depcruise does not resolve the apps' `@/` alias, so the unresolved name is matched too.
      to: {
        path: '^apps/(?:web|admin)/src/features/|^@/features/',
        pathNot: ['^apps/$1/src/features/$2/', '^@/features/$2/'],
      },
    },
    {
      name: 'contracts-stay-pure',
      comment: 'contracts is shared with the browser: zod and types only.',
      severity: 'error',
      from: { path: '^packages/contracts/' },
      to: { path: '^packages/(core|db|providers)/|^apps/|(^|/)@dakly/(?!contracts/)' },
    },
    {
      name: 'contracts-import-only-zod',
      comment: 'The browser loads contracts, so its code imports only zod and its own files.',
      severity: 'error',
      from: { path: '^packages/contracts/src/', pathNot: '\\.spec\\.ts$' },
      to: { pathNot: '^packages/contracts/src/|(^|/)node_modules/zod/' },
    },
    {
      name: 'db-only-from-repositories',
      comment: 'Only repositories and platform/database talk to the database package.',
      severity: 'error',
      from: {
        path: '^(packages/core|apps/(api|worker))/src/',
        pathNot: ['\\.repository\\.ts$', '^packages/core/src/platform/database/', '\\.spec\\.ts$'],
      },
      to: { path: '^packages/db/|node_modules/drizzle-orm|^drizzle-orm(/|$)|(^|/)@dakly/db(/|$)' },
    },
    {
      name: 'repositories-only-from-services-and-jobs',
      comment:
        'Controllers, guards, pipes and other non-service files never call a repository. ' +
        'Services, their use-case files (no role suffix), jobs, repositories and module wiring may. ' +
        'See docs/rules/layers.md.',
      severity: 'error',
      from: {
        path: '^packages/core/src/.*[^/.]+\\.[a-z-]+\\.ts$',
        pathNot: '\\.(service|job|repository|module|spec)\\.ts$',
      },
      to: { path: '\\.repository\\.ts$' },
    },
    {
      name: 'web-apps-do-not-import-core-or-db',
      comment: 'The web apps reach shop data only through the API. See docs/rules/frontend.md.',
      severity: 'error',
      from: { path: '^apps/(web|admin)/src/' },
      to: { path: '^packages/(core|db)/|(^|/)@dakly/(core|db)(/|$)' },
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
      name: 'web-shared-code-does-not-know-features-by-alias',
      comment:
        'The same rule for `@/` imports, which depcruise leaves unresolved. ' +
        'Specs are left out: lib/authenticated-writes.spec.tsx drives feature hooks on purpose.',
      severity: 'error',
      from: {
        path: '^apps/(?:web|admin)/src/(components|lib)/',
        pathNot: '\\.spec\\.tsx?$',
      },
      to: { path: '^@/(features|app)/' },
    },
    {
      name: 'providers-do-not-know-core',
      comment:
        'Drivers translate vendor payloads only; business rules stay in core. See docs/rules/providers.md.',
      severity: 'error',
      from: { path: '^packages/providers/' },
      to: { path: '^packages/(core|db)/|^apps/|(^|/)@dakly/(?!contracts/)' },
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
