import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['server/tests/**/*.test.js'],
    // Single worker: protects Neon free-tier 5-connection limit
    pool: 'forks',
    maxWorkers: 1,
    minWorkers: 1,
    // Neon free tier cold-starts take 6-10s — allow up to 15s per test
    testTimeout: 15000,
  },
});
