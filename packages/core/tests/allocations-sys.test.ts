import { describe, it, expect } from 'vitest'
import {
  oneSided,
  allocationDeepcopy,
  decidePositions,
  oneSidedBp,
} from '../src/allocations/sys.js'

describe('allocations/sys', () => {
  it('computes oneSided difference', () => {
    expect(oneSided(['gov', 'gov', 'opp'])).toBe(1)
    expect(oneSided(['opp', 'opp', 'gov', 'opp'])).toBe(-2)
  })

  it('deep-copies allocation squares', () => {
    const allocation = [
      { id: 0, teams: [1, 2], chairs: [3], panels: [4], trainees: [5], venue: 1 },
      { id: 1, teams: [3, 4], chairs: [], panels: [], trainees: [], venue: 2 },
    ]
    const cloned = allocationDeepcopy(allocation)
    expect(cloned).toEqual(allocation)
    cloned[0].teams[0] = 99
    expect(allocation[0].teams[0]).toBe(1)
  })

  it('decides positions to balance sides (2-team)', () => {
    const compiledTeamResults = [
      { id: 1, past_sides: ['gov', 'gov'] },
      { id: 2, past_sides: ['opp', 'opp'] },
    ]
    const config = { style: { team_num: 2 } }
    expect(decidePositions([1, 2], compiledTeamResults, config)).toEqual([2, 1])
  })

  it('computes BP one-sided values', () => {
    expect(oneSidedBp(['og', 'og', 'oo', 'oo'])).toEqual([1, 0])
  })

  it('keeps order when no past sides (4-team)', () => {
    const compiledTeamResults = [
      { id: 1, past_sides: [] },
      { id: 2, past_sides: [] },
      { id: 3, past_sides: [] },
      { id: 4, past_sides: [] },
    ]
    const config = { style: { team_num: 4 } }
    expect(decidePositions([1, 2, 3, 4], compiledTeamResults, config)).toEqual([1, 2, 3, 4])
  })
})
