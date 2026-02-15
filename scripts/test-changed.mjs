#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, '..')
const timeoutSeconds = Number.parseInt(process.env.UTAB_CHANGED_TIMEOUT_SEC ?? '120', 10)

if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) {
  console.error(`Invalid UTAB_CHANGED_TIMEOUT_SEC: ${process.env.UTAB_CHANGED_TIMEOUT_SEC ?? ''}`)
  process.exit(2)
}

const packageConfigs = [
  { name: 'web', dir: 'packages/web' },
  { name: 'server', dir: 'packages/server' },
  { name: 'core', dir: 'packages/core' },
]
const testableExtension = /\.(ts|tsx|js|jsx|mjs|cjs|vue)$/i
const fullRunMarkers = new Set([
  'package.json',
  'vitest.config.ts',
  'vitest.config.js',
  'tsconfig.json',
  'tsconfig.lint.json',
  'tsconfig.typecheck.json',
])

function runGit(args) {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim()
}

function tryGit(args) {
  try {
    return runGit(args)
  } catch {
    return ''
  }
}

function listFromOutput(output) {
  if (!output) return []
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

function resolveBaseRef() {
  const fromEnv = String(process.env.UTAB_BASE_REF ?? '').trim()
  if (fromEnv) return fromEnv

  const mainBase = tryGit(['merge-base', 'HEAD', 'origin/main'])
  if (mainBase) return mainBase

  const masterBase = tryGit(['merge-base', 'HEAD', 'origin/master'])
  if (masterBase) return masterBase

  return 'HEAD~1'
}

function listChangedFiles(baseRef) {
  const fromBase = listFromOutput(tryGit(['diff', '--name-only', '--diff-filter=ACMR', `${baseRef}...HEAD`]))
  const fromHead = listFromOutput(tryGit(['diff', '--name-only', '--diff-filter=ACMR', 'HEAD']))
  return Array.from(new Set([...fromBase, ...fromHead])).sort()
}

function runCommandWithTimeout(parts, extraEnv = {}) {
  const args = ['packages/web/scripts/run-with-timeout.mjs', String(timeoutSeconds), ...parts]
  const result = spawnSync('node', args, {
    cwd: repoRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      ...extraEnv,
    },
  })

  if (result.error) {
    throw result.error
  }
  return result.status ?? 1
}

const baseRef = resolveBaseRef()
const changedFiles = listChangedFiles(baseRef)

if (changedFiles.length === 0) {
  console.log(`No changed files detected (base: ${baseRef}). Skipping tests.`)
  process.exit(0)
}

console.log(`Running changed tests (base: ${baseRef})`)
let hasFailure = false
let executedCount = 0

for (const pkg of packageConfigs) {
  const prefix = `${pkg.dir}/`
  const pkgChanged = changedFiles.filter((file) => file.startsWith(prefix))
  if (pkgChanged.length === 0) continue

  const packageRelative = pkgChanged.map((file) => file.slice(prefix.length))
  const relatedTargets = Array.from(
    new Set(packageRelative.filter((file) => testableExtension.test(file)))
  )
  const needsFullRun = packageRelative.some((file) => fullRunMarkers.has(file))

  if (!needsFullRun && relatedTargets.length === 0) {
    continue
  }

  const vitestArgs = needsFullRun
    ? ['run', '--passWithNoTests']
    : ['related', '--run', '--passWithNoTests', ...relatedTargets]

  const commandParts = ['pnpm', '-C', pkg.dir, 'exec', 'vitest', ...vitestArgs]
  const includeSlow = process.env.UTAB_INCLUDE_SLOW === '1'
  const env = includeSlow ? { UTAB_FULL_CHECK: '1' } : {}

  console.log(`\n[${pkg.name}] ${needsFullRun ? 'full' : 'related'} test run (${relatedTargets.length} target files)`)
  const status = runCommandWithTimeout(commandParts, env)
  executedCount += 1

  if (status !== 0) {
    hasFailure = true
  }
}

if (executedCount === 0) {
  console.log('No testable package changes detected. Skipping tests.')
  process.exit(0)
}

process.exit(hasFailure ? 1 : 0)
