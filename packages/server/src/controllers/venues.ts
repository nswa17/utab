import type { RequestHandler } from 'express'
import { getVenueModel } from '../models/venue.js'
import { sanitizeVenueForPublic } from '../services/response-sanitizer.js'
import { createTournamentEntityCrudHandlers } from './shared/tournament-entity-crud.js'

const handlers = createTournamentEntityCrudHandlers({
  fields: ['name', 'details', 'userDefinedData'],
  getModel: getVenueModel,
  sanitizeForPublic: sanitizeVenueForPublic,
  invalidEntityIdMessage: 'Invalid venue id',
  notFoundMessage: 'Venue not found',
  duplicateConflictMessage: 'Venue name already exists',
})

export const listVenues: RequestHandler = handlers.list
export const getVenue: RequestHandler = handlers.get
export const createVenue: RequestHandler = handlers.create
export const bulkUpdateVenues: RequestHandler = handlers.bulkUpdate
export const bulkDeleteVenues: RequestHandler = handlers.bulkDelete
export const updateVenue: RequestHandler = handlers.update
export const deleteVenue: RequestHandler = handlers.deleteOne
