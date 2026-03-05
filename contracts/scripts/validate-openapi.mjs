import { access } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import SwaggerParser from '@apidevtools/swagger-parser'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')

const OPENAPI_FILE = 'openapi/tab-v1.yaml'

const REQUIRED_TAB_PATHS = [
  '/api/v1/tournaments',
  '/api/v1/tournaments/{id}',
  '/api/v1/rounds',
  '/api/v1/teams',
  '/api/v1/speakers',
  '/api/v1/adjudicators',
  '/api/v1/compiled',
  '/api/v1/submissions',
  '/api/v1/speakers/{id}/personal-data',
  '/api/v1/adjudicators/{id}/personal-data',
  '/api/v1/privacy/erasure-requests',
  '/api/v1/privacy/erasure-requests/{id}/approve',
  '/api/v1/privacy/erasure-requests/{id}/reject',
  '/api/v1/privacy/erasure-requests/{id}/cancel',
  '/api/v1/privacy/erasure-requests/{id}/execute',
  '/api/v1/auth/service-token-revocations'
]

const WRITE_METHODS = new Set(['post', 'patch'])

function ensure(condition, message, errors) {
  if (!condition) errors.push(message)
}

function hasIdempotencyHeader(parameters = []) {
  return parameters.some((parameter) => {
    if (!parameter || typeof parameter !== 'object') return false
    if (parameter.$ref === '#/components/parameters/IdempotencyKeyHeader') return true
    if (parameter.in !== 'header') return false
    return String(parameter.name ?? '').toLowerCase() === 'x-idempotency-key'
  })
}

function resolveOpenApiRef(spec, ref) {
  if (typeof ref !== 'string' || !ref.startsWith('#/')) return null
  const segments = ref
    .slice(2)
    .split('/')
    .map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'))
  let current = spec
  for (const segment of segments) {
    if (!current || typeof current !== 'object') return null
    current = current[segment]
  }
  return current ?? null
}

function resolveMaybeRef(spec, value) {
  if (!value || typeof value !== 'object') return null
  if (typeof value.$ref === 'string') {
    return resolveOpenApiRef(spec, value.$ref)
  }
  return value
}

function validateV1PathsOnly(spec, fileLabel, errors) {
  const paths = spec?.paths ?? {}
  for (const routePath of Object.keys(paths)) {
    if (!routePath.startsWith('/api/v1/')) {
      errors.push(`${fileLabel}: non-v1 path is not allowed: ${routePath}`)
    }
  }
}

function validateRequiredPaths(spec, fileLabel, errors) {
  const paths = spec?.paths ?? {}
  for (const requiredPath of REQUIRED_TAB_PATHS) {
    ensure(Boolean(paths[requiredPath]), `${fileLabel}: missing required path ${requiredPath}`, errors)
  }
}

function validateIdempotencyOnWrite(spec, fileLabel, errors) {
  const paths = spec?.paths ?? {}
  for (const [routePath, pathItem] of Object.entries(paths)) {
    const pathParameters = Array.isArray(pathItem?.parameters) ? pathItem.parameters : []
    for (const [method, operation] of Object.entries(pathItem ?? {})) {
      const normalizedMethod = method.toLowerCase()
      if (!WRITE_METHODS.has(normalizedMethod)) continue
      if (!operation || typeof operation !== 'object') continue
      const operationParameters = Array.isArray(operation.parameters) ? operation.parameters : []
      if (!hasIdempotencyHeader([...pathParameters, ...operationParameters])) {
        errors.push(
          `${fileLabel}: ${normalizedMethod.toUpperCase()} ${routePath} must define X-Idempotency-Key`
        )
      }
    }
  }
}

function validateErasureRequestListContract(spec, fileLabel, errors) {
  const operation = spec?.paths?.['/api/v1/privacy/erasure-requests']?.get
  ensure(Boolean(operation), `${fileLabel}: missing GET /api/v1/privacy/erasure-requests`, errors)
  if (!operation) return

  const queryParameterNames = (Array.isArray(operation.parameters) ? operation.parameters : [])
    .map((parameter) => resolveMaybeRef(spec, parameter))
    .filter(Boolean)
    .filter((parameter) => parameter.in === 'query')
    .map((parameter) => String(parameter.name ?? '').toLowerCase())

  ensure(
    queryParameterNames.includes('requestedby'),
    `${fileLabel}: GET /api/v1/privacy/erasure-requests must support requestedBy query`,
    errors
  )
  ensure(
    queryParameterNames.includes('cursor'),
    `${fileLabel}: GET /api/v1/privacy/erasure-requests must support cursor query`,
    errors
  )
}

async function loadOpenApiSpec(relativePath) {
  const filePath = path.resolve(rootDir, relativePath)
  await access(filePath)
  const spec = await SwaggerParser.validate(filePath)
  return { spec, relativePath }
}

async function run() {
  const errors = []
  const tab = await loadOpenApiSpec(OPENAPI_FILE)

  validateV1PathsOnly(tab.spec, tab.relativePath, errors)
  validateRequiredPaths(tab.spec, tab.relativePath, errors)
  validateIdempotencyOnWrite(tab.spec, tab.relativePath, errors)
  validateErasureRequestListContract(tab.spec, tab.relativePath, errors)

  if (errors.length > 0) {
    console.error('OpenAPI contract validation failed:')
    for (const error of errors) console.error(`- ${error}`)
    process.exitCode = 1
    return
  }

  console.log('OpenAPI contract validated successfully.')
}

run().catch((error) => {
  console.error('OpenAPI contract validation failed with an exception.')
  console.error(error)
  process.exitCode = 1
})
