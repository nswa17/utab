import { describe, it, expect } from 'vitest'
import { compileTeamResults } from '../src/results/results.js'

describe('results/compileTeamResults (advanced)', () => {
  it('compiles team results with speaker integration', () => {
    const teams = [
      { id: 't1', details: [{ r: 1, speakers: ['s1', 's2'] }] },
      { id: 't2', details: [{ r: 1, speakers: ['s3', 's4'] }] },
    ]
    const speakers = [{ id: 's1' }, { id: 's2' }, { id: 's3' }, { id: 's4' }]
    const rawTeamResults = [
      { id: 't1', r: 1, win: 1, opponents: ['t2'], side: 'gov' },
      { id: 't2', r: 1, win: 0, opponents: ['t1'], side: 'opp' },
    ]
    const rawSpeakerResults = [
      { id: 's1', r: 1, scores: [70] },
      { id: 's2', r: 1, scores: [70] },
      { id: 's3', r: 1, scores: [60] },
      { id: 's4', r: 1, scores: [60] },
    ]
    const style = { team_num: 2, score_weights: [1] }

    const compiled = compileTeamResults(
      teams,
      speakers,
      rawTeamResults,
      rawSpeakerResults,
      [1],
      style
    )
    const team1 = compiled.find((r) => r.id === 't1')
    const team2 = compiled.find((r) => r.id === 't2')

    expect(team1?.sum).toBe(140)
    expect(team2?.sum).toBe(120)
    expect(team1?.margin).toBe(20)
    expect(team2?.margin).toBe(-20)
  })
})
