import type { ServiceAccountPrincipal } from './service-account.js'

declare global {
  namespace Express {
    interface Request {
      serviceAccount?: ServiceAccountPrincipal
    }
  }
}

export {}
