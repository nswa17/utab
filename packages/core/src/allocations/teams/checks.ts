import { filterAvailable, checkDetail } from '../../general/tools.js'
import { sillyLogger } from '../../general/loggers.js'
import { NeedMore } from '../../general/errors.js'

export function checkNumsOfTeams(teams: any[], style: { team_num: number }, r: number): void {
  sillyLogger(checkNumsOfTeams, arguments, 'draws')
  const teamNum = style.team_num
  const numTeams = filterAvailable(teams, r).length
  if (numTeams % teamNum !== 0) {
    throw new NeedMore('team', teamNum - (numTeams % teamNum))
  }
}

export function teamAllocationPrecheck(
  teams: any[],
  _institutions: any[],
  style: { team_num: number },
  r: number
): void {
  sillyLogger(teamAllocationPrecheck, arguments, 'draws')
  checkDetail(teams, r)
  checkNumsOfTeams(teams, style, r)
}

export default { teamAllocationPrecheck }
