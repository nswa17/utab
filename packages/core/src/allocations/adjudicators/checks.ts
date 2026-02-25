import { filterAvailable, checkDetail } from '../../general/tools.js'
import { sillyLogger } from '../../general/loggers.js'
import { NeedMore } from '../../general/errors.js'
import type { NumbersOfAdjudicators } from '../../types/allocations.js'
import type { AdjudicatorEntity, TeamEntity } from '../../types/domain.js'

function checkNumsOfAdjudicators(
  teams: TeamEntity[],
  adjudicators: AdjudicatorEntity[],
  style: { team_num: number },
  r: number,
  { chairs = 0, panels = 0, trainees = 0 }: Partial<NumbersOfAdjudicators>
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
  teams: TeamEntity[],
  adjudicators: AdjudicatorEntity[],
  _institutions: unknown[],
  style: { team_num: number },
  r: number,
  numbers: Partial<NumbersOfAdjudicators>
): void {
  sillyLogger(adjudicatorAllocationPrecheck, arguments, 'draws')
  checkDetail(adjudicators, r)
  checkDetail(teams, r)
  checkNumsOfAdjudicators(teams, adjudicators, style, r, numbers)
}

export default { adjudicatorAllocationPrecheck }
