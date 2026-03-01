import { describe, expect, it } from 'vitest'
import {
  isBreakRoundLike,
  readAllocationTeamIds,
  readBreakParticipantTeamIds,
  resolveBreakStageTeamIds,
} from './break-round'

describe('break-round', () => {
  it('detects break round from round-level break_round flag', () => {
    expect(isBreakRoundLike({ roundUserDefinedData: { break_round: true } })).toBe(true)
  })

  it('detects break round from draw-level algorithm flag', () => {
    expect(
      isBreakRoundLike({ drawUserDefinedData: { team_allocation_algorithm: 'break' } })
    ).toBe(true)
  })

  it('normalizes break participant ids', () => {
    expect(
      readBreakParticipantTeamIds([
        { teamId: 'team-1', seed: 1 },
        { teamId: 'team-1', seed: 99 },
        { teamId: ' team-2 ', seed: 2 },
        { teamId: '', seed: 3 },
      ])
    ).toEqual(['team-1', 'team-2'])
  })

  it('resolves break stage teams with stage_participants precedence', () => {
    const teamIds = resolveBreakStageTeamIds({
      drawUserDefinedData: {
        break: {
          stage_participants: [
            { teamId: 'team-a', seed: 1 },
            { teamId: 'team-b', seed: 2 },
          ],
          participants: [
            { teamId: 'team-a', seed: 1 },
            { teamId: 'team-b', seed: 2 },
            { teamId: 'team-c', seed: 3 },
          ],
        },
      },
      allocation: [
        { teams: { gov: 'team-a', opp: 'team-b' } },
        { teams: { gov: 'team-c', opp: 'team-d' } },
      ],
    })
    expect(teamIds).toEqual(['team-a', 'team-b'])
  })

  it('falls back to allocation teams when break metadata is missing', () => {
    expect(
      resolveBreakStageTeamIds({
        allocation: [{ teams: { gov: 'team-1', opp: 'team-2' } }, { teams: ['team-2', 'team-3'] }],
      })
    ).toEqual(['team-1', 'team-2', 'team-3'])
  })

  it('falls back to round participants when draw break metadata is absent', () => {
    expect(
      resolveBreakStageTeamIds({
        roundUserDefinedData: {
          break: {
            participants: [{ teamId: 'team-1', seed: 1 }, { teamId: 'team-2', seed: 2 }],
          },
        },
        allocation: [{ teams: { gov: 'team-3', opp: 'team-4' } }],
      })
    ).toEqual(['team-1', 'team-2'])
  })

  it('extracts allocation teams from both object and array team shapes', () => {
    expect(
      readAllocationTeamIds([
        { teams: { gov: 'gov-1', opp: 'opp-1' } },
        { teams: ['opp-1', 'team-2', ''] },
      ])
    ).toEqual(['gov-1', 'opp-1', 'team-2'])
  })
})
