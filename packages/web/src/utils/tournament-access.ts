type PlainRecord = Record<string, unknown>

type AccessFormOptions = {
  preserveExistingPassword?: boolean
}

function asRecord(value: unknown): PlainRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  return value as PlainRecord
}

export function readTournamentAccessState(authValue: unknown): {
  required: boolean
  password: string
  hasPassword: boolean
} {
  const auth = asRecord(authValue)
  const access = asRecord(auth.access)
  const password = typeof access.password === 'string' ? String(access.password) : ''
  const hasPassword = access.hasPassword === true || password.length > 0
  return {
    required: access.required === true,
    password,
    hasPassword,
  }
}

export function resolveTournamentAccessForm(
  authValue: unknown,
  existingPassword = '',
  options: AccessFormOptions = {}
): {
  required: boolean
  password: string
} {
  const access = readTournamentAccessState(authValue)
  if (access.password.length > 0) {
    return { required: access.required, password: access.password }
  }
  if (options.preserveExistingPassword && access.hasPassword) {
    return { required: access.required, password: existingPassword }
  }
  return { required: access.required, password: '' }
}
