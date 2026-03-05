import { z } from 'zod'

const TRUE_VALUES = new Set(['true', '1'])
const FALSE_VALUES = new Set(['false', '0'])

function parseBooleanString(value: string): boolean | undefined {
  const normalized = value.trim().toLowerCase()
  if (TRUE_VALUES.has(normalized)) return true
  if (FALSE_VALUES.has(normalized)) return false
  return undefined
}

export const strictEnvBoolean = z.preprocess((value) => {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const parsed = parseBooleanString(value)
    return parsed === undefined ? value : parsed
  }
  return value
}, z.boolean())
