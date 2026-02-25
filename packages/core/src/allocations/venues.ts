import { sillyLogger } from '../general/loggers.js'
import { filterAvailable } from '../general/tools.js'
import { sortAllocation } from '../general/sortings.js'
import { shuffle } from '../general/math.js'
import { venueAllocationPrecheck } from './venues/checks.js'
import type { AllocationConfig, Draw } from '../types/allocations.js'
import type { CompiledTeamResult } from '../types/results.js'
import type { VenueEntity } from '../types/domain.js'

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
  const availableVenues = filterAvailable(venues, r)
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
