import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup/global.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/server.ts'],
    },
    // Unit tests are pure TS, fast, parallel-safe
    // Integration/e2e may need sequential and longer timeouts — override per-file
  },
});
