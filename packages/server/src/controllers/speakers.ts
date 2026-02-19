import type { RequestHandler } from 'express'
import { getSpeakerModel } from '../models/speaker.js'
import { sanitizeSpeakerForPublic } from '../services/response-sanitizer.js'
import { createTournamentEntityCrudHandlers } from './shared/tournament-entity-crud.js'

const handlers = createTournamentEntityCrudHandlers({
  fields: ['name', 'userDefinedData'],
  getModel: getSpeakerModel,
  sanitizeForPublic: sanitizeSpeakerForPublic,
  invalidEntityIdMessage: 'Invalid speaker id',
  notFoundMessage: 'Speaker not found',
  duplicateConflictMessage: 'Speaker name already exists',
})

export const listSpeakers: RequestHandler = handlers.list
export const getSpeaker: RequestHandler = handlers.get
export const createSpeaker: RequestHandler = handlers.create
export const bulkUpdateSpeakers: RequestHandler = handlers.bulkUpdate
export const bulkDeleteSpeakers: RequestHandler = handlers.bulkDelete
export const updateSpeaker: RequestHandler = handlers.update
export const deleteSpeaker: RequestHandler = handlers.deleteOne
