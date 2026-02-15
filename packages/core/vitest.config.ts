import { defineConfig } from 'vitest/config'

const isFullCheck = process.env.UTAB_FULL_CHECK === '1'
const defaultTimeoutMs = 120_000
const fullTimeoutMs = 600_000

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    pool: 'forks',
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
    testTimeout: isFullCheck ? fullTimeoutMs : defaultTimeoutMs,
    hookTimeout: isFullCheck ? fullTimeoutMs : defaultTimeoutMs,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/', '**/*.d.ts', '**/*.config.*'],
    },
  },
})
