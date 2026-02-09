#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')

const args = process.argv.slice(2)
if (args.length === 0) {
  console.error('Usage: node scripts/codex-debug.js <command> [args...]')
  console.error('Example: node scripts/codex-debug.js pnpm -C packages/server dev')
  process.exit(1)
}

const repoRoot = path.resolve(__dirname, '..')
const logDir = path.join(repoRoot, '.codex', 'logs')
fs.mkdirSync(logDir, { recursive: true })

const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
const logFile = path.join(logDir, `debug-${timestamp}.log`)

const formatArg = (value) => {
  if (/[^A-Za-z0-9_./:-]/.test(value)) {
    return JSON.stringify(value)
  }
  return value
}

const header = [
  '# codex-debug',
  `# timestamp: ${new Date().toISOString()}`,
  `# cwd: ${process.cwd()}`,
  `# command: ${args.map(formatArg).join(' ')}`,
  '',
].join('\n')

fs.writeFileSync(logFile, header)

const env = {
  ...process.env,
  UTAB_LOG_LEVEL: process.env.UTAB_LOG_LEVEL ?? 'debug',
}

console.log(`codex-debug: writing logs to ${logFile}`)

const child = spawn(args[0], args.slice(1), {
  stdio: ['inherit', 'pipe', 'pipe'],
  env,
  cwd: process.cwd(),
})

const logStream = fs.createWriteStream(logFile, { flags: 'a' })

child.stdout.on('data', (chunk) => {
  process.stdout.write(chunk)
  logStream.write(chunk)
})

child.stderr.on('data', (chunk) => {
  process.stderr.write(chunk)
  logStream.write(chunk)
})

const forwardSignal = (signal) => {
  if (!child.killed) {
    child.kill(signal)
  }
}

process.on('SIGINT', () => forwardSignal('SIGINT'))
process.on('SIGTERM', () => forwardSignal('SIGTERM'))

child.on('close', (code, signal) => {
  const footer = `\n# exit: ${code ?? 'null'} signal: ${signal ?? 'null'}\n`
  logStream.write(footer)
  logStream.end()
  if (typeof code === 'number') {
    process.exitCode = code
  } else {
    process.exitCode = 1
  }
})
