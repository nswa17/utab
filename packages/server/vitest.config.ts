import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    globalSetup: './test/global-setup.ts',
    setupFiles: ['./test/setup-env.ts'],
    pool: 'forks',
    fileParallelism: true,
    maxWorkers: 2,
    minWorkers: 1,
    testTimeout: 6000000,
    hookTimeout: 6000000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/', '**/*.d.ts', '**/*.config.*'],
    },
  },
})
