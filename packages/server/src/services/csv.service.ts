const FORMULA_PREFIX_PATTERN = /^[\t\n\r ]*[=+\-@]/
const SIGNED_NUMBER_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i

function neutralizeFormula(value: string): string {
  const candidate = value.replace(/^[\t\n\r ]+/, '')
  if (!FORMULA_PREFIX_PATTERN.test(value) || SIGNED_NUMBER_PATTERN.test(candidate)) {
    return value
  }
  return `'${value}`
}

export function escapeCsvCell(value: string): string {
  const safeValue = neutralizeFormula(value)
  if (
    safeValue.includes('"') ||
    safeValue.includes(',') ||
    safeValue.includes('\n') ||
    safeValue.includes('\r')
  ) {
    return `"${safeValue.replace(/"/g, '""')}"`
  }
  return safeValue
}
