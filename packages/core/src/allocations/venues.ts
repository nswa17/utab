import { sillyLogger } from '../general/loggers.js'
import { filterAvailable } from '../general/tools.js'
import { sortAllocation } from '../general/sortings.js'
import { shuffle } from '../general/math.js'
import { venueAllocationPrecheck } from './venues/checks.js'

function getVenueDraw(
  r: number,
  draw: any,
  venues: any[],
  compiledTeamResults: any[],
  config: any,
  shuffleOpt?: boolean
) {
  sillyLogger(getVenueDraw, arguments, 'draws')
  const allocation = draw.allocation
  const availableVenues = filterAvailable(venues, r)
  const newAllocation: any[] = shuffleOpt
    ? shuffle(allocation, config.name)
    : sortAllocation(allocation, compiledTeamResults)

  let i = 0
  for (const square of newAllocation as any[]) {
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
