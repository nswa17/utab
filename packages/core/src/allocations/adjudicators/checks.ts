import { filterAvailable, checkDetail } from '../../general/tools.js'
import { sillyLogger } from '../../general/loggers.js'
import { NeedMore } from '../../general/errors.js'

function checkNumsOfAdjudicators(
  teams: any[],
  adjudicators: any[],
  style: { team_num: number },
  r: number,
  { chairs = 0, panels = 0, trainees = 0 }
): void {
  sillyLogger(checkNumsOfAdjudicators, arguments, 'draws')
  const teamNum = style.team_num
  const numTeams = filterAvailable(teams, r).length
  const numAdjudicators = filterAvailable(adjudicators, r).length
  const adjudicatorsPerSquare = chairs + panels + trainees
  if (numAdjudicators < (numTeams / teamNum) * adjudicatorsPerSquare) {
    throw new NeedMore(
      'adjudicator',
      Math.ceil((numTeams / teamNum) * adjudicatorsPerSquare - numAdjudicators)
    )
  }
}

export function adjudicatorAllocationPrecheck(
  teams: any[],
  adjudicators: any[],
  _institutions: any[],
  style: { team_num: number },
  r: number,
  numbers: any
): void {
  sillyLogger(adjudicatorAllocationPrecheck, arguments, 'draws')
  checkDetail(adjudicators, r)
  checkDetail(teams, r)
  checkNumsOfAdjudicators(teams, adjudicators, style, r, numbers)
}

export default { adjudicatorAllocationPrecheck }
