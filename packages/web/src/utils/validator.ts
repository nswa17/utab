export function isNonEmpty(value: string): boolean {
  return value.trim().length > 0
}

export function minLength(value: string, length: number): boolean {
  return value.trim().length >= length
}

export function validators<T>(
  ...fns: Array<(value: T) => boolean>
): (_rule: unknown, value: T, callback: (error?: Error) => void) => void {
  return (rule, value, callback) => {
    if (fns.every((fn) => fn(value))) {
      callback()
    } else {
      const message = (rule as { message?: string } | null)?.message ?? 'Validation failed'
      callback(new Error(message))
    }
  }
}

export function not<T>(fn: (value: T) => boolean): (value: T) => boolean {
  return (value) => !fn(value)
}

export function isInteger(value: unknown): boolean {
  return Number.isInteger(Number(value))
}

export function isNonZero(value: unknown): boolean {
  return Number(value) !== 0
}

export function isPositive(value: unknown): boolean {
  return Number(value) >= 0
}

export function isNegative(value: unknown): boolean {
  return Number(value) <= 0
}

export function exists<T extends Record<string, unknown>>(
  list: { value: T[] },
  key: keyof T,
  cast?: (value: unknown) => unknown
) {
  return (value: unknown) => {
    const values = list.value.map((item) => (cast ? cast(item[key]) : item[key]))
    return values.includes(cast ? cast(value) : value)
  }
}
