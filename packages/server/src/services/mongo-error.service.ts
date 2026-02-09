export function isDuplicateKeyError(err: unknown): boolean {
  const error = err as any
  if (!error) return false
  if (error.code === 11000) return true
  if (error?.cause?.code === 11000) return true
  if (error?.result?.result?.code === 11000) return true
  if (Array.isArray(error?.writeErrors) && error.writeErrors.some((e: any) => e?.code === 11000)) {
    return true
  }
  if (typeof error?.message === 'string' && error.message.includes('E11000')) return true
  return false
}
