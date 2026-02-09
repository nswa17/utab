import { describe, it, expect } from 'vitest'
import { mGaleShapley } from '../src/allocations/teams/matchings.js'

describe('allocations/teams/matchings', () => {
  it('builds symmetric pairings with cap=1', () => {
    const teams = [1, 2, 3, 4]
    const ranks = {
      1: [2, 3, 4],
      2: [1, 3, 4],
      3: [1, 2, 4],
      4: [1, 2, 3],
    }
    const matching = mGaleShapley(teams, ranks, 1)
    for (const id of teams) {
      expect(matching[id]).toHaveLength(1)
      const partner = matching[id][0]
      expect(matching[partner]).toContain(id)
    }
  })
})
