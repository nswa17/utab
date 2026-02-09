import { filterAvailable, checkDetail } from '../../general/tools.js'
import { sillyLogger } from '../../general/loggers.js'
import { NeedMore } from '../../general/errors.js'

export function checkNumsOfVenues(
  teams: any[],
  venues: any[],
  style: { team_num: number },
  r: number
): void {
  sillyLogger(checkNumsOfVenues, arguments, 'draws')
  const teamNum = style.team_num
  const numTeams = filterAvailable(teams, r).length
  const numVenues = filterAvailable(venues, r).length
  if (numVenues < numTeams / teamNum) {
    throw new NeedMore('venue', Math.ceil(numTeams / teamNum - numVenues))
  }
}

export function venueAllocationPrecheck(
  teams: any[],
  venues: any[],
  style: { team_num: number },
  r: number
): void {
  sillyLogger(venueAllocationPrecheck, arguments, 'draws')
  checkDetail(venues, r)
  checkDetail(teams, r)
  checkNumsOfVenues(teams, venues, style, r)
}

export default { venueAllocationPrecheck }
