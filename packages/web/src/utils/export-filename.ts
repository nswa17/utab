const INVALID_FILENAME_CHARACTERS = /[\u0000-\u001f<>:"/\\|?*]+/g
const WHITESPACE = /\s+/g
const REPEATED_DASHES = /-+/g
const LEADING_OR_TRAILING_SEPARATORS = /^[-._]+|[-._]+$/g
const MAX_SEGMENT_LENGTH = 80

/**
 * Makes a human-readable filename segment that is safe on the common desktop
 * platforms while keeping Japanese tournament names intact.
 */
export function sanitizeExportFilenameSegment(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(INVALID_FILENAME_CHARACTERS, '-')
    .replace(WHITESPACE, '-')
    .replace(REPEATED_DASHES, '-')
    .replace(LEADING_OR_TRAILING_SEPARATORS, '')
    .slice(0, MAX_SEGMENT_LENGTH)
}

export function buildTournamentExportFilename(
  tournamentName: unknown,
  tournamentId: unknown,
  suffix: string
): string {
  const prefix = [
    sanitizeExportFilenameSegment(tournamentName),
    sanitizeExportFilenameSegment(tournamentId),
  ]
    .filter(Boolean)
    .join('_')

  return `${prefix || 'utab'}_${suffix}`
}
