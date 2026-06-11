import { sillyLogger } from '../general/loggers.js'
import { accessDetail, filterAvailable } from '../general/tools.js'
import { sortAllocation } from '../general/sortings.js'
import { shuffle } from '../general/math.js'
import { venueAllocationPrecheck } from './venues/checks.js'
import type { AllocationConfig, Draw } from '../types/allocations.js'
import type { CompiledTeamResult } from '../types/results.js'
import type { VenueEntity } from '../types/domain.js'

function venuePriority(venue: VenueEntity, r: number): number {
  const priority = Number(accessDetail(venue, r).priority)
  return Number.isFinite(priority) ? priority : 1
}

function sortVenuesByPriority(venues: VenueEntity[], r: number): VenueEntity[] {
  return venues.slice().sort((left, right) => {
    const priorityDiff = venuePriority(left, r) - venuePriority(right, r)
    if (priorityDiff !== 0) return priorityDiff
    return left.id - right.id
  })
}

function getVenueDraw(
  r: number,
  draw: Draw,
  venues: VenueEntity[],
  compiledTeamResults: CompiledTeamResult[],
  config: AllocationConfig,
  shuffleOpt?: boolean
): Draw {
  sillyLogger(getVenueDraw, arguments, 'draws')
  const allocation = draw.allocation
  const availableVenues = sortVenuesByPriority(filterAvailable(venues, r), r)
  const newAllocation = shuffleOpt
    ? shuffle(allocation, config.name)
    : sortAllocation(allocation, compiledTeamResults)

  let i = 0
  for (const square of newAllocation) {
    square.venue = availableVenues[i]?.id ?? null
    i += 1
  }

  return {
    r: draw.r,
    allocation: newAllocation,
  }
}

const standard = { get: getVenueDraw }
const precheck = venueAllocationPrecheck

export { standard, precheck }
export default { standard, precheck }
