import type { RequestHandler } from 'express'
import { getAdjudicatorModel } from '../models/adjudicator.js'
import { sanitizeAdjudicatorForPublic } from '../services/response-sanitizer.js'
import { createTournamentEntityCrudHandlers } from './shared/tournament-entity-crud.js'

const handlers = createTournamentEntityCrudHandlers({
  fields: ['name', 'strength', 'active', 'preev', 'details', 'userDefinedData'],
  getModel: getAdjudicatorModel,
  sanitizeForPublic: sanitizeAdjudicatorForPublic,
  invalidEntityIdMessage: 'Invalid adjudicator id',
  notFoundMessage: 'Adjudicator not found',
  duplicateConflictMessage: 'Adjudicator already exists',
})

export const listAdjudicators: RequestHandler = handlers.list
export const getAdjudicator: RequestHandler = handlers.get
export const createAdjudicator: RequestHandler = handlers.create
export const bulkUpdateAdjudicators: RequestHandler = handlers.bulkUpdate
export const bulkDeleteAdjudicators: RequestHandler = handlers.bulkDelete
export const updateAdjudicator: RequestHandler = handlers.update
export const deleteAdjudicator: RequestHandler = handlers.deleteOne
