import { defineConfig } from 'vitest/config';

// Integration tests run against real Postgres and Redis (docker compose locally, service containers in CI).
export default defineConfig({
  test: {
    // Share the provider error classes with the built drivers' CommonJS imports.
    server: { deps: { external: [/\/packages\/providers\/dist\/channel\/channel-driver\.js$/] } },
    include: ['src/**/*.int.spec.ts'],
    fileParallelism: false,
    globalSetup: ['./test/queue-prefix.ts'],
  },
});
