export type ServiceAccountRole = 'superuser' | 'organizer'

export type ServiceAccountScope = 'read' | 'create' | 'upsert' | 'delete'

export type ServiceAccountPrincipal = {
  kind: 'service_account'
  sub: string
  role: ServiceAccountRole
  orgId: string
  scopes: ServiceAccountScope[]
  jti: string
  audience: string | string[]
  expiresAt: number
  tournamentIds: '*' | string[]
}
