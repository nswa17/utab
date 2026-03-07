import { Router, type RequestHandler } from 'express'
import { healthRouter } from './health.js'

type RouterModuleLoader = () => Promise<Record<string, unknown>>

function lazyRoute(loader: RouterModuleLoader, exportName: string): RequestHandler {
  let resolved: RequestHandler | null = null
  let pending: Promise<RequestHandler> | null = null

  async function load(): Promise<RequestHandler> {
    if (resolved) return resolved
    if (!pending) {
      pending = loader().then((mod) => {
        const route = mod[exportName]
        if (typeof route !== 'function') {
          throw new Error(`Route module export "${exportName}" is not a router`)
        }
        resolved = route as RequestHandler
        return resolved
      })
    }
    return pending
  }

  return (req, res, next) => {
    void load()
      .then((route) => route(req, res, next))
      .catch(next)
  }
}

export function createRoutes(): Router {
  const router = Router()
  router.use('/health', healthRouter)
  router.use('/auth', lazyRoute(() => import('./auth.js'), 'authRouter'))
  router.use('/tournaments', lazyRoute(() => import('./tournaments.js'), 'tournamentRouter'))
  router.use('/results', lazyRoute(() => import('./results.js'), 'resultRouter'))
  router.use('/teams', lazyRoute(() => import('./teams.js'), 'teamRouter'))
  router.use('/adjudicators', lazyRoute(() => import('./adjudicators.js'), 'adjudicatorRouter'))
  router.use('/submissions', lazyRoute(() => import('./submissions.js'), 'submissionRouter'))
  router.use('/draws', lazyRoute(() => import('./draws.js'), 'drawRouter'))
  router.use('/allocations', lazyRoute(() => import('./allocations.js'), 'allocationRouter'))
  router.use('/compiled', lazyRoute(() => import('./compiled.js'), 'compiledRouter'))
  router.use('/venues', lazyRoute(() => import('./venues.js'), 'venueRouter'))
  router.use('/speakers', lazyRoute(() => import('./speakers.js'), 'speakerRouter'))
  router.use('/institutions', lazyRoute(() => import('./institutions.js'), 'institutionRouter'))
  router.use('/rounds', lazyRoute(() => import('./rounds.js'), 'roundRouter'))
  router.use('/styles', lazyRoute(() => import('./styles.js'), 'styleRouter'))
  router.use('/raw-results', lazyRoute(() => import('./raw-results.js'), 'rawResultRouter'))
  router.use('/audit-logs', lazyRoute(() => import('./audit-logs.js'), 'auditLogRouter'))
  router.use('/privacy', lazyRoute(() => import('./privacy.js'), 'privacyRouter'))
  router.use('/dev-tools', lazyRoute(() => import('../devtools/routes.js'), 'devToolsRouter'))
  return router
}
