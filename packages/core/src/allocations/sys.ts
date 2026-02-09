import { sum, sd, count, permutator, shuffle } from '../general/math.js'
import { sillyLogger } from '../general/loggers.js'

export interface AllocationSquare {
  id: number
  teams: number[]
  chairs?: number[]
  panels?: number[]
  trainees?: number[]
  venue?: number | null
}

export interface CompiledResult {
  id: number
  win?: number
  sum?: number
  past_sides?: string[]
  details?: Array<{ score?: number }>
  margin?: number
}

export function oneSided(pastSides: string[]): number {
  return count(pastSides, 'gov') - count(pastSides, 'opp')
}

export function allocationDeepcopy(allocation: AllocationSquare[]): AllocationSquare[] {
  const newAllocation: AllocationSquare[] = []
  for (const square of allocation) {
    const { teams, chairs = [], panels = [], trainees = [], venue = null, id } = square
    newAllocation.push({
      teams: [...teams],
      chairs: [...chairs],
      panels: [...panels],
      trainees: [...trainees],
      venue,
      id,
    })
  }
  return newAllocation
}

export function findOne<T extends { id: number }>(list: T[], id: number): T {
  const found = list.find((e) => e.id === id)
  if (!found) throw new Error(`id ${id} not found`)
  return found
}

export function oneSidedBp(pastSides: string[]): [number, number] {
  if (pastSides.length === 0) return [0, 0]
  const opening =
    (count(pastSides, 'og') +
      count(pastSides, 'oo') -
      count(pastSides, 'cg') -
      count(pastSides, 'co')) /
    pastSides.length
  const gov =
    (count(pastSides, 'og') +
      count(pastSides, 'cg') -
      count(pastSides, 'oo') -
      count(pastSides, 'co')) /
    pastSides.length
  return [opening, gov]
}

export function squareOneSidedBp(pastSidesList: string[][]): number {
  const positions = ['og', 'oo', 'cg', 'co']
  let ind1 = 0
  let ind2 = 0
  for (let i = 0; i < positions.length; i++) {
    const [opening, gov] = oneSidedBp(pastSidesList[i].concat([positions[i]]))
    ind1 += Math.abs(opening)
    ind2 += Math.abs(gov)
  }
  return ind1 + ind2
}

export function squareOneSided(pastSidesList: string[][]): number {
  const positions = ['gov', 'opp']
  let ind = 0
  for (let i = 0; i < positions.length; i++) {
    const g = oneSided(pastSidesList[i].concat([positions[i]]))
    ind += Math.abs(g)
  }
  return ind
}

export function decidePositions(
  teams: number[],
  compiledTeamResults: CompiledResult[],
  config: { style: { team_num: number } }
): number[] {
  const pastSidesList = teams.map((id) => findOne(compiledTeamResults, id).past_sides || [])
  let decidedTeams = teams

  if (config.style.team_num === 2) {
    if (oneSided(pastSidesList[0]) > oneSided(pastSidesList[1])) {
      decidedTeams = [teams[1], teams[0]]
    } else if (oneSided(pastSidesList[1]) > oneSided(pastSidesList[0])) {
      decidedTeams = [teams[0], teams[1]]
    }
  } else if (config.style.team_num === 4) {
    const teamsList = permutator(teams)
    const vlist = teamsList.map((ids) =>
      squareOneSidedBp(ids.map((id) => findOne(compiledTeamResults, id).past_sides || []))
    )
    decidedTeams = teamsList[vlist.indexOf(Math.min(...vlist))]
  }
  return decidedTeams
}

export function decidePositionsRandom(
  teams: number[],
  _compiledTeamResults: CompiledResult[],
  config: { name?: string; style: { team_num: number } }
): number[] {
  return shuffle(teams, config.name)
}

export default {
  oneSided,
  allocationDeepcopy,
  findOne,
  oneSidedBp,
  squareOneSidedBp,
  squareOneSided,
  decidePositions,
  decidePositionsRandom,
}
