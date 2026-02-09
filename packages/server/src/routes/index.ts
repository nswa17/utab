import { Router } from 'express'
import { healthRouter } from './health.js'
import { authRouter } from './auth.js'
import { tournamentRouter } from './tournaments.js'
import { resultRouter } from './results.js'
import { teamRouter } from './teams.js'
import { adjudicatorRouter } from './adjudicators.js'
import { submissionRouter } from './submissions.js'
import { drawRouter } from './draws.js'
import { allocationRouter } from './allocations.js'
import { compiledRouter } from './compiled.js'
import { venueRouter } from './venues.js'
import { speakerRouter } from './speakers.js'
import { institutionRouter } from './institutions.js'
import { roundRouter } from './rounds.js'
import { styleRouter } from './styles.js'
import { rawResultRouter } from './raw-results.js'
import { auditLogRouter } from './audit-logs.js'

export function createRoutes(): Router {
  const router = Router()
  router.use('/health', healthRouter)
  router.use('/auth', authRouter)
  router.use('/tournaments', tournamentRouter)
  router.use('/results', resultRouter)
  router.use('/teams', teamRouter)
  router.use('/adjudicators', adjudicatorRouter)
  router.use('/submissions', submissionRouter)
  router.use('/draws', drawRouter)
  router.use('/allocations', allocationRouter)
  router.use('/compiled', compiledRouter)
  router.use('/venues', venueRouter)
  router.use('/speakers', speakerRouter)
  router.use('/institutions', institutionRouter)
  router.use('/rounds', roundRouter)
  router.use('/styles', styleRouter)
  router.use('/raw-results', rawResultRouter)
  router.use('/audit-logs', auditLogRouter)
  return router
}
