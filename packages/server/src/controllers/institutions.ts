import type { RequestHandler } from 'express'
import { getInstitutionModel } from '../models/institution.js'
import { sanitizeInstitutionForPublic } from '../services/response-sanitizer.js'
import { createTournamentEntityCrudHandlers } from './shared/tournament-entity-crud.js'

const handlers = createTournamentEntityCrudHandlers({
  fields: ['name', 'category', 'priority', 'userDefinedData'],
  getModel: getInstitutionModel,
  sanitizeForPublic: sanitizeInstitutionForPublic,
  invalidEntityIdMessage: 'Invalid institution id',
  notFoundMessage: 'Institution not found',
  duplicateConflictMessage: 'Institution name already exists',
})

export const listInstitutions: RequestHandler = handlers.list
export const getInstitution: RequestHandler = handlers.get
export const createInstitution: RequestHandler = handlers.create
export const bulkUpdateInstitutions: RequestHandler = handlers.bulkUpdate
export const bulkDeleteInstitutions: RequestHandler = handlers.bulkDelete
export const updateInstitution: RequestHandler = handlers.update
export const deleteInstitution: RequestHandler = handlers.deleteOne
