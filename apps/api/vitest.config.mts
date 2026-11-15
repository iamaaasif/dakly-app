import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Share the built core modules with Nest's CommonJS imports, including metadata symbols.
    server: { deps: { external: [/\/packages\/core\/dist\//] } },
    include: ['test/**/*.spec.ts'],
    exclude: ['test/**/*.int.spec.ts'],
  },
});
