import { defineConfig } from 'vitest/config';

// SMTP delivery is read back through the real Mailpit API.
export default defineConfig({
  test: {
    include: ['src/**/*.int.spec.ts'],
    fileParallelism: false,
  },
});
