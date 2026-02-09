import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { getLogger, sillyLogger, ensureLogDirectory } from '../src/general/loggers.js'

describe('general/loggers', () => {
  it('returns a logger by category', () => {
    const logger = getLogger('results')
    expect(typeof logger.info).toBe('function')
    expect(typeof logger.debug).toBe('function')
  })

  it('sillyLogger does not throw', () => {
    const fn = () => {}
    expect(() => sillyLogger(fn, [1, 2, 3], 'general', 'file.ts')).not.toThrow()
  })

  it('ensures log directory exists', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'utab-core-'))
    const target = path.join(base, 'nested', 'logs')
    expect(fs.existsSync(target)).toBe(false)
    ensureLogDirectory(target)
    expect(fs.existsSync(target)).toBe(true)
    expect(fs.statSync(target).isDirectory()).toBe(true)
    fs.rmSync(base, { recursive: true, force: true })
  })
})
