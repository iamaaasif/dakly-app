import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['src/**/*.spec.{ts,tsx}', '*.spec.ts'], environment: 'node' },
});
