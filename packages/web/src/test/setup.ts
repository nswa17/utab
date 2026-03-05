type MutableGlobal = typeof globalThis & {
  localStorage?: Storage
  sessionStorage?: Storage
}

function createMemoryStorage(): Storage {
  const store = new Map<string, string>()

  return {
    get length() {
      return store.size
    },
    clear() {
      store.clear()
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null
    },
    key(index: number) {
      const keys = Array.from(store.keys())
      return keys[index] ?? null
    },
    removeItem(key: string) {
      store.delete(key)
    },
    setItem(key: string, value: string) {
      store.set(key, String(value))
    },
  }
}

function hasStorageShape(value: unknown): value is Storage {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<Storage>
  return (
    typeof candidate.getItem === 'function' &&
    typeof candidate.setItem === 'function' &&
    typeof candidate.removeItem === 'function' &&
    typeof candidate.clear === 'function'
  )
}

function resolveStorage(kind: 'localStorage' | 'sessionStorage'): Storage {
  const browserStorage = globalThis.window?.[kind]
  if (hasStorageShape(browserStorage)) return browserStorage
  return createMemoryStorage()
}

function ensureGlobalStorage(kind: 'localStorage' | 'sessionStorage') {
  const globals = globalThis as MutableGlobal
  if (hasStorageShape(globals[kind])) return

  Object.defineProperty(globals, kind, {
    value: resolveStorage(kind),
    writable: true,
    configurable: true,
    enumerable: true,
  })
}

ensureGlobalStorage('localStorage')
ensureGlobalStorage('sessionStorage')
