import { describe, it, expect } from 'vitest'
import {
  summarizeAdjudicatorResults,
  compileAdjudicatorResults,
} from '../src/results/results.js'

describe('results/adjudicators', () => {
  it('summarizes adjudicator results with comments', () => {
    const adjudicators = [{ id: 1 }, { id: 2 }]
    const raw = [
      { id: 1, r: 1, score: 80, judged_teams: [1], comment: 'good' },
      { id: 1, r: 1, score: 70, judged_teams: [1], comment: '' },
      { id: 2, r: 1, score: 60, judged_teams: [2], comment: 'ok' },
    ]
    const results = summarizeAdjudicatorResults(adjudicators, raw, 1)
    const adj1 = results.find((r) => r.id === 1)
    expect(adj1?.score).toBe(75)
    expect(adj1?.comments).toEqual(['good'])
  })

  it('compiles adjudicator results across rounds', () => {
    const adjudicators = [{ id: 1 }, { id: 2 }]
    const raw = [
      { id: 1, r: 1, score: 80, judged_teams: [1], comment: 'a' },
      { id: 1, r: 2, score: 70, judged_teams: [2], comment: '' },
      { id: 2, r: 1, score: 60, judged_teams: [1], comment: 'b' },
    ]
    const compiled = compileAdjudicatorResults(adjudicators, raw, [1, 2])
    const adj1 = compiled.find((r) => r.id === 1)
    const adj2 = compiled.find((r) => r.id === 2)
    expect(adj1?.average).toBe(75)
    expect(adj1?.active_num).toBe(2)
    expect(adj1?.judged_teams).toEqual([1, 2])
    expect(adj2?.average).toBe(60)
    expect(adj2?.active_num).toBe(1)
  })
})
