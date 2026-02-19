import type { RequestHandler } from 'express'
import { getTeamModel } from '../models/team.js'
import { sanitizeTeamForPublic } from '../services/response-sanitizer.js'
import { createTournamentEntityCrudHandlers } from './shared/tournament-entity-crud.js'

const handlers = createTournamentEntityCrudHandlers({
  fields: ['name', 'institution', 'speakers', 'details', 'userDefinedData'],
  getModel: getTeamModel,
  sanitizeForPublic: sanitizeTeamForPublic,
  invalidEntityIdMessage: 'Invalid team id',
  notFoundMessage: 'Team not found',
  duplicateConflictMessage: 'Team name already exists',
})

export const listTeams: RequestHandler = handlers.list
export const getTeam: RequestHandler = handlers.get
export const createTeam: RequestHandler = handlers.create
export const bulkUpdateTeams: RequestHandler = handlers.bulkUpdate
export const bulkDeleteTeams: RequestHandler = handlers.bulkDelete
export const updateTeam: RequestHandler = handlers.update
export const deleteTeam: RequestHandler = handlers.deleteOne
