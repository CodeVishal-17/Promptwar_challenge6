import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: { name: 'server', include: ['tests/server/**/*.test.ts'], environment: 'node' },
      },
      {
        extends: true,
        test: { name: 'web', include: ['tests/web/**/*.test.ts'], environment: 'jsdom' },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['server/src/**', 'shared/**', 'web/src/**'],
      thresholds: { lines: 80 },
    },
  },
});
