#!/usr/bin/env node

import { spawn } from 'node:child_process'

const [, , timeoutSecondsArg, ...commandParts] = process.argv

if (!timeoutSecondsArg || commandParts.length === 0) {
  console.error('Usage: node scripts/run-with-timeout.mjs <timeout-seconds> <command> [args...]')
  process.exit(2)
}

const timeoutSeconds = Number.parseInt(timeoutSecondsArg, 10)
if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) {
  console.error(`Invalid timeout: ${timeoutSecondsArg}`)
  process.exit(2)
}

const [command, ...args] = commandParts
const child = spawn(command, args, {
  stdio: 'inherit',
  shell: false,
})

let timedOut = false
const timeoutMs = timeoutSeconds * 1000
const timer = setTimeout(() => {
  timedOut = true
  console.error(`Command timed out after ${timeoutSeconds}s: ${commandParts.join(' ')}`)
  child.kill('SIGTERM')
  setTimeout(() => child.kill('SIGKILL'), 5_000)
}, timeoutMs)

child.on('exit', (code, signal) => {
  clearTimeout(timer)
  if (timedOut) {
    process.exit(124)
  }
  if (signal) {
    console.error(`Command terminated by signal: ${signal}`)
    process.exit(1)
  }
  process.exit(code ?? 1)
})
