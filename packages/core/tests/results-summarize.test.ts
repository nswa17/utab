import { describe, it, expect } from 'vitest'
import {
  summarizeTeamResults,
  summarizeSpeakerResults,
  compileTeamResults,
} from '../src/results/results.js'

describe('results/results', () => {
  it('summarizes team results for a round', () => {
    const teams = [{ id: 1 }, { id: 2 }]
    const style = { team_num: 2 }
    const rawTeamResults = [
      { id: 1, r: 1, win: 1, opponents: [2], side: 'gov' },
      { id: 1, r: 1, win: 1, opponents: [2], side: 'gov' },
      { id: 2, r: 1, win: 0, opponents: [1], side: 'opp' },
      { id: 2, r: 1, win: 0, opponents: [1], side: 'opp' },
    ]

    const results = summarizeTeamResults(teams, rawTeamResults, 1, style)
    const team1 = results.find((r) => r.id === 1)
    const team2 = results.find((r) => r.id === 2)

    expect(team1?.win).toBe(1)
    expect(team1?.vote).toBe(2)
    expect(team1?.vote_rate).toBe(1)
    expect(team1?.acc).toBe(2)
    expect(team1?.side).toBe('gov')

    expect(team2?.win).toBe(0)
    expect(team2?.vote).toBe(-2)
    expect(team2?.vote_rate).toBe(0)
    expect(team2?.acc).toBe(2)
    expect(team2?.side).toBe('opp')
  })

  it('treats split ballots as a tied round result', () => {
    const teams = [{ id: 1 }, { id: 2 }]
    const style = { team_num: 2 }
    const rawTeamResults = [
      { id: 1, r: 1, win: 1, opponents: [2], side: 'gov' },
      { id: 1, r: 1, win: 0, opponents: [2], side: 'gov' },
      { id: 2, r: 1, win: 0, opponents: [1], side: 'opp' },
      { id: 2, r: 1, win: 1, opponents: [1], side: 'opp' },
    ]

    const results = summarizeTeamResults(teams, rawTeamResults, 1, style)
    const team1 = results.find((r) => r.id === 1)
    const team2 = results.find((r) => r.id === 2)

    expect(team1?.vote).toBe(0)
    expect(team2?.vote).toBe(0)
    expect(team1?.vote_rate).toBe(0.5)
    expect(team2?.vote_rate).toBe(0.5)
    expect(team1?.win).toBe(0.5)
    expect(team2?.win).toBe(0.5)
  })

  it('keeps compiled vote_rate null when the round format has no vote-rate semantics', () => {
    const teams = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]
    const style = { team_num: 4 }
    const rawTeamResults = [
      { id: 1, r: 1, win: 3, opponents: [2, 3, 4], side: 'og' },
      { id: 2, r: 1, win: 2, opponents: [1, 3, 4], side: 'oo' },
      { id: 3, r: 1, win: 1, opponents: [1, 2, 4], side: 'cg' },
      { id: 4, r: 1, win: 0, opponents: [1, 2, 3], side: 'co' },
    ]

    const compiled = compileTeamResults(teams, rawTeamResults, [1], style)
    expect(compiled.every((row) => row.vote_rate === null)).toBe(true)
  })

  it('keeps compiled vote_rate null when a team has no selected-round ballots', () => {
    const teams = [{ id: 1 }, { id: 2 }]
    const compiled = compileTeamResults(teams, [], [1], { team_num: 2 })
    expect(compiled.map((row) => row.vote_rate)).toEqual([null, null])
  })

  it('summarizes speaker results with weighted average', () => {
    const speakers = [{ id: 11 }, { id: 12 }]
    const style = { score_weights: [1, 1] }
    const rawSpeakerResults = [
      { id: 11, r: 1, scores: [70, 75] },
      { id: 11, r: 1, scores: [70, 75] },
      { id: 12, r: 1, scores: [80, 80] },
    ]

    const results = summarizeSpeakerResults(speakers, rawSpeakerResults, style, 1)
    const speaker11 = results.find((r) => r.id === 11)
    const speaker12 = results.find((r) => r.id === 12)

    expect(speaker11?.average).toBe(72.5)
    expect(speaker11?.sum).toBe(145)
    expect(speaker12?.average).toBe(80)
  })

  it('compiles simple team results across rounds', () => {
    const teams = [{ id: 1 }, { id: 2 }]
    const style = { team_num: 2 }
    const rawTeamResults = [
      { id: 1, r: 1, win: 1, opponents: [2], side: 'gov' },
      { id: 1, r: 1, win: 1, opponents: [2], side: 'gov' },
      { id: 2, r: 1, win: 0, opponents: [1], side: 'opp' },
      { id: 2, r: 1, win: 0, opponents: [1], side: 'opp' },
      { id: 1, r: 2, win: 0, opponents: [2], side: 'opp' },
      { id: 1, r: 2, win: 0, opponents: [2], side: 'opp' },
      { id: 2, r: 2, win: 1, opponents: [1], side: 'gov' },
      { id: 2, r: 2, win: 1, opponents: [1], side: 'gov' },
    ]

    const compiled = compileTeamResults(teams, rawTeamResults, [1, 2], style)
    const team1 = compiled.find((r) => r.id === 1)
    const team2 = compiled.find((r) => r.id === 2)

    expect(team1?.win).toBe(1)
    expect(team2?.win).toBe(1)
    expect(team1?.past_sides).toEqual(['gov', 'opp'])
    expect(team2?.past_sides).toEqual(['opp', 'gov'])
    expect(team1?.vote_rate).toBe(0.5)
    expect(team2?.vote_rate).toBe(0.5)
    expect(team1?.sum).toBeNull()
    expect(team2?.sum).toBeNull()
  })

  it('keeps valid fractional two-team support rates within [0, 1]', () => {
    const teams = [{ id: 1 }, { id: 2 }]
    const style = { team_num: 2 }
    const rawTeamResults = [
      { id: 1, r: 1, win: 0, opponents: [2], side: 'gov' },
      { id: 1, r: 1, win: 0.5, opponents: [2], side: 'gov' },
      { id: 1, r: 1, win: 1, opponents: [2], side: 'gov' },
      { id: 2, r: 1, win: 1, opponents: [1], side: 'opp' },
      { id: 2, r: 1, win: 0.5, opponents: [1], side: 'opp' },
      { id: 2, r: 1, win: 0, opponents: [1], side: 'opp' },
    ]

    const results = summarizeTeamResults(teams, rawTeamResults, 1, style)
    expect(results).toHaveLength(2)
    for (const result of results) {
      expect(result.vote_rate).not.toBeNull()
      expect(result.vote_rate).toBeGreaterThanOrEqual(0)
      expect(result.vote_rate).toBeLessThanOrEqual(1)
      expect(result.win).toBeGreaterThanOrEqual(0)
      expect(result.win).toBeLessThanOrEqual(1)
    }
    expect(results.find((result) => result.id === 1)?.vote_rate).toBe(0.5)
    expect(results.find((result) => result.id === 2)?.vote_rate).toBe(0.5)
  })

})
