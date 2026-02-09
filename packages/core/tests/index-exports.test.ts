import { describe, it, expect } from 'vitest'
import coreDefault, {
  TournamentHandler,
  CON,
  results,
  teams,
  adjudicators,
  venues,
  sys,
} from '../src/index.js'

describe('core index exports', () => {
  it('exposes primary constructors and modules', () => {
    expect(typeof TournamentHandler).toBe('function')
    expect(typeof CON).toBe('function')
    expect(coreDefault).toHaveProperty('allocations')
    expect(coreDefault).toHaveProperty('results')
  })

  it('exports allocations modules', () => {
    expect(typeof teams.standard.get).toBe('function')
    expect(typeof adjudicators.standard.get).toBe('function')
    expect(typeof venues.standard.get).toBe('function')
    expect(typeof sys.decidePositions).toBe('function')
  })

  it('exports results helpers', () => {
    expect(typeof results.compileTeamResults).toBe('function')
    expect(typeof results.compileSpeakerResults).toBe('function')
    expect(typeof results.compileAdjudicatorResults).toBe('function')
  })
})
