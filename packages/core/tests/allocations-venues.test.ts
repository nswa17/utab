import { describe, it, expect } from 'vitest'
import { standard } from '../src/allocations/venues.js'
import { shuffle } from '../src/general/math.js'

describe('allocations/venues', () => {
  it('assigns venues in input order when not shuffled', () => {
    const venues = [
      { id: 10, details: [{ r: 1, available: true, priority: 2 }] },
      { id: 20, details: [{ r: 1, available: true, priority: 1 }] },
    ]
    const draw = {
      r: 1,
      allocation: [
        { id: 0, teams: [1, 2], chairs: [], panels: [], trainees: [], venue: null },
        { id: 1, teams: [3, 4], chairs: [], panels: [], trainees: [], venue: null },
      ],
    }
    const compiledTeamResults = [
      { id: 1, win: 2, sum: 10 },
      { id: 2, win: 0, sum: 0 },
      { id: 3, win: 1, sum: 5 },
      { id: 4, win: 1, sum: 5 },
    ]
    const config = { name: 'seed', style: { team_num: 2 } }
    const result = standard.get(1, draw, venues, compiledTeamResults, config, false)
    const venuesAssigned = result.allocation.map((s: any) => s.venue)
    expect(venuesAssigned).toEqual([10, 20])
  })

  it('returns null when there are fewer available venues', () => {
    const venues = [{ id: 10, details: [{ r: 1, available: true, priority: 1 }] }]
    const draw = {
      r: 1,
      allocation: [
        { id: 0, teams: [1, 2], chairs: [], panels: [], trainees: [], venue: null },
        { id: 1, teams: [3, 4], chairs: [], panels: [], trainees: [], venue: null },
      ],
    }
    const compiledTeamResults = [
      { id: 1, win: 2, sum: 10 },
      { id: 2, win: 0, sum: 0 },
      { id: 3, win: 1, sum: 5 },
      { id: 4, win: 1, sum: 5 },
    ]
    const config = { name: 'seed', style: { team_num: 2 } }
    const result = standard.get(1, draw, venues, compiledTeamResults, config, false)
    const venuesAssigned = result.allocation.map((s: any) => s.venue)
    expect(venuesAssigned).toEqual([10, null])
  })

  it('uses seeded shuffle when shuffle is true', () => {
    const venues = [
      { id: 10, details: [{ r: 1, available: true, priority: 2 }] },
      { id: 20, details: [{ r: 1, available: true, priority: 1 }] },
    ]
    const draw = {
      r: 1,
      allocation: [
        { id: 0, teams: [1, 2], chairs: [], panels: [], trainees: [], venue: null },
        { id: 1, teams: [3, 4], chairs: [], panels: [], trainees: [], venue: null },
      ],
    }
    const compiledTeamResults = [
      { id: 1, win: 2, sum: 10 },
      { id: 2, win: 0, sum: 0 },
      { id: 3, win: 1, sum: 5 },
      { id: 4, win: 1, sum: 5 },
    ]
    const config = { name: 'seed', style: { team_num: 2 } }
    const shuffled = shuffle(draw.allocation, config.name)
    const result = standard.get(1, draw, venues, compiledTeamResults, config, true)
    const venuesAssigned = result.allocation.map((s: any) => s.venue)
    const expected = shuffled.map((_, idx) => venues[idx]?.id ?? null)
    expect(venuesAssigned.sort()).toEqual(expected.sort())
  })
})
