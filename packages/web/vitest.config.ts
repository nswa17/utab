import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const isFullCheck = process.env.UTAB_FULL_CHECK === '1'
const defaultTimeoutMs = 30_000
const fullTimeoutMs = 600_000

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    passWithNoTests: true,
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
