import { defineConfig } from 'vitest/config';

// Integration tests run against real Postgres and Redis (docker compose locally, service containers in CI).
export default defineConfig({
  test: {
    include: ['src/**/*.int.spec.ts'],
    fileParallelism: false,
  },
});
