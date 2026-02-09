import { describe, it, expect } from 'vitest'
import {
  speakerResultsPrecheck,
  adjudicatorResultsPrecheck,
  teamResultsPrecheck,
  resultsPrecheck,
} from '../src/results/checks.js'
import { ResultNotSent, WinPointsDifferent, DetailNotDefined } from '../src/general/errors.js'

describe('results/checks', () => {
  it('throws when speaker results are missing', () => {
    const speakers = [{ id: 1 }]
    expect(() => speakerResultsPrecheck([], speakers, 1)).toThrow(ResultNotSent)
  })

  it('throws when adjudicator results are missing', () => {
    const adjudicators = [{ id: 9 }]
    expect(() => adjudicatorResultsPrecheck([], adjudicators, 1)).toThrow(ResultNotSent)
  })

  it('throws when win points are inconsistent (2-team)', () => {
    const teams = [{ id: 1 }, { id: 2 }]
    const rawTeamResults = [
      { id: 1, r: 1, win: 1 },
      { id: 1, r: 1, win: 0 },
      { id: 2, r: 1, win: 0 },
      { id: 2, r: 1, win: 1 },
    ]
    expect(() => teamResultsPrecheck(rawTeamResults, teams, 1, 2)).toThrow(WinPointsDifferent)
  })

  it('passes when win points are consistent (4-team)', () => {
    const teams = [{ id: 1 }, { id: 2 }]
    const rawTeamResults = [
      { id: 1, r: 1, win: 1 },
      { id: 1, r: 1, win: 1 },
      { id: 2, r: 1, win: 0 },
      { id: 2, r: 1, win: 0 },
    ]
    expect(() => teamResultsPrecheck(rawTeamResults, teams, 1, 4)).not.toThrow()
  })

  it('checks that round detail exists', () => {
    const teams = [{ id: 1, details: [] }]
    expect(() => resultsPrecheck(teams, [], 1)).toThrow(DetailNotDefined)
  })
})
