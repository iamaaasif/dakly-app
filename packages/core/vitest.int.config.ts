import { defineConfig } from 'vitest/config';

// Integration tests run against a real Postgres (docker compose locally, a service container in CI).
export default defineConfig({
  test: {
    include: ['src/**/*.int.spec.ts'],
    fileParallelism: false,
  },
});
