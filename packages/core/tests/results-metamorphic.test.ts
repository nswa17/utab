import { describe, expect, it } from 'vitest'
import {
  compileAdjudicatorResults,
  compileSpeakerResults,
  compileTeamResults,
} from '../src/results/results.js'

function byId<T extends { id: number }>(rows: T[]): T[] {
  return [...rows].sort((left, right) => left.id - right.id)
}

describe('compiled results metamorphic invariants', () => {
  it('is invariant to input permutation and duplicate round selectors', () => {
    const teams = [{ id: 1 }, { id: 2 }]
    const rawTeamResults = [
      { id: 1, from_id: 101, r: 1, win: 1, opponents: [2], side: 'gov' },
      { id: 2, from_id: 101, r: 1, win: 0, opponents: [1], side: 'opp' },
      { id: 1, from_id: 102, r: 2, win: 1, opponents: [2], side: 'opp' },
      { id: 2, from_id: 102, r: 2, win: 0, opponents: [1], side: 'gov' },
    ]
    const teamStyle = { team_num: 2 }

    const teamBaseline = byId(compileTeamResults(teams, rawTeamResults, [1, 2], teamStyle))
    const teamTransformed = byId(
      compileTeamResults(
        [...teams].reverse(),
        [...rawTeamResults].reverse(),
        [2, 1, 2, 1],
        teamStyle
      )
    )
    expect(teamTransformed).toEqual(teamBaseline)

    const speakers = [{ id: 11 }, { id: 12 }]
    const rawSpeakerResults = [
      { id: 11, from_id: 101, r: 1, scores: [75] },
      { id: 12, from_id: 101, r: 1, scores: [70] },
      { id: 11, from_id: 102, r: 2, scores: [76] },
      { id: 12, from_id: 102, r: 2, scores: [71] },
    ]
    const speakerStyle = { score_weights: [1] }
    const speakerBaseline = byId(
      compileSpeakerResults(speakers, rawSpeakerResults, speakerStyle, [1, 2])
    )
    const speakerTransformed = byId(
      compileSpeakerResults(
        [...speakers].reverse(),
        [...rawSpeakerResults].reverse(),
        speakerStyle,
        [2, 1, 1, 2]
      )
    )
    expect(speakerTransformed).toEqual(speakerBaseline)

    const adjudicators = [{ id: 21 }, { id: 22 }]
    const rawAdjudicatorResults = [
      { id: 21, from_id: 1, r: 1, score: 8, judged_teams: [1, 2] },
      { id: 22, from_id: 2, r: 1, score: 7, judged_teams: [1, 2] },
      { id: 21, from_id: 1, r: 2, score: 9, judged_teams: [1, 2] },
      { id: 22, from_id: 2, r: 2, score: 6, judged_teams: [1, 2] },
    ]
    const adjudicatorBaseline = byId(
      compileAdjudicatorResults(adjudicators, rawAdjudicatorResults, [1, 2])
    )
    const adjudicatorTransformed = byId(
      compileAdjudicatorResults(
        [...adjudicators].reverse(),
        [...rawAdjudicatorResults].reverse(),
        [2, 2, 1, 1]
      )
    )
    expect(adjudicatorTransformed).toEqual(adjudicatorBaseline)
  })
})
