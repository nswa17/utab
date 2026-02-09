type PlainObject = Record<string, unknown>

export interface TournamentAccessConfig {
  required: boolean
  password?: string
  passwordHash?: string
  version: number
}

function asRecord(value: unknown): PlainObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  return { ...(value as PlainObject) }
}

function toPositiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) return fallback
  return parsed
}

function hasOwn(source: PlainObject, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(source, key)
}

export function getTournamentAccessConfig(auth: unknown): TournamentAccessConfig {
  const authObject = asRecord(auth)
  const access = asRecord(authObject.access)

  const required = access.required === true
  const password =
    typeof access.password === 'string' && access.password.length > 0 ? access.password : undefined
  const passwordHash =
    typeof access.passwordHash === 'string' && access.passwordHash.length > 0
      ? access.passwordHash
      : undefined
  const version = toPositiveInt(access.version, 1)

  return { required, password, passwordHash, version }
}

export async function mergeTournamentAuth(
  existingAuth: unknown,
  incomingAuth: unknown,
  options?: { isCreate?: boolean }
): Promise<{ auth: PlainObject; error?: string; accessPasswordUpdated: boolean }> {
  const existingObject = asRecord(existingAuth)
  const incomingObject = asRecord(incomingAuth)
  const mergedAuth: PlainObject = { ...existingObject, ...incomingObject }

  const existingAccess = getTournamentAccessConfig(existingObject)
  const incomingAccess = asRecord(incomingObject.access)

  let required = existingAccess.required
  if (hasOwn(incomingAccess, 'required')) {
    required = incomingAccess.required === true
  }

  let password = existingAccess.password
  let passwordHash = existingAccess.passwordHash
  let accessPasswordUpdated = false

  if (hasOwn(incomingAccess, 'password')) {
    const nextPassword = incomingAccess.password
    if (typeof nextPassword === 'string' && nextPassword.length > 0) {
      if (nextPassword !== existingAccess.password || !existingAccess.password || existingAccess.passwordHash) {
        accessPasswordUpdated = true
      }
      password = nextPassword
      passwordHash = undefined
    } else if (nextPassword === null || nextPassword === '') {
      if (existingAccess.password || existingAccess.passwordHash) {
        accessPasswordUpdated = true
      }
      password = undefined
      passwordHash = undefined
    } else if (nextPassword !== undefined) {
      return {
        auth: mergedAuth,
        error: 'Invalid tournament access password',
        accessPasswordUpdated,
      }
    }
  }

  if (hasOwn(incomingAccess, 'passwordHash')) {
    const nextHash = incomingAccess.passwordHash
    if (typeof nextHash === 'string' && nextHash.length > 0) {
      if (nextHash !== existingAccess.passwordHash || existingAccess.password) {
        accessPasswordUpdated = true
      }
      password = undefined
      passwordHash = nextHash
    } else if (nextHash === null || nextHash === '') {
      if (existingAccess.password || existingAccess.passwordHash) {
        accessPasswordUpdated = true
      }
      password = undefined
      passwordHash = undefined
    } else if (nextHash !== undefined) {
      return {
        auth: mergedAuth,
        error: 'Invalid tournament access password hash',
        accessPasswordUpdated,
      }
    }
  }

  if (required && !password && !passwordHash) {
    return {
      auth: mergedAuth,
      error: 'Tournament access password is required',
      accessPasswordUpdated,
    }
  }

  let version = existingAccess.version
  if (options?.isCreate) {
    version = 1
  } else if (accessPasswordUpdated) {
    version += 1
  }
  if (version < 1) {
    version = 1
  }

  const accessPayload: PlainObject = { required, version }
  if (password) {
    accessPayload.password = password
  } else if (passwordHash) {
    accessPayload.passwordHash = passwordHash
  }

  mergedAuth.access = accessPayload

  return { auth: mergedAuth, accessPasswordUpdated }
}

export function sanitizeTournamentAuth(auth: unknown): PlainObject {
  const authObject = asRecord(auth)
  const accessObject = asRecord(authObject.access)
  const accessConfig = getTournamentAccessConfig(authObject)

  const sanitizedAccess: PlainObject = {
    ...accessObject,
    required: accessConfig.required,
    version: accessConfig.version,
    hasPassword: Boolean(accessConfig.password || accessConfig.passwordHash),
  }
  if (accessConfig.password) {
    sanitizedAccess.password = accessConfig.password
  } else {
    delete sanitizedAccess.password
  }
  delete sanitizedAccess.passwordHash

  return {
    ...authObject,
    access: sanitizedAccess,
  }
}
