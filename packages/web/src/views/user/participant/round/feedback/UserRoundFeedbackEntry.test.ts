import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function load(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

describe('UserRoundFeedbackEntry request context', () => {
  it('ignores a late feedback completion after the participant context changes', () => {
    const source = load('src/views/user/participant/round/feedback/UserRoundFeedbackEntry.vue')
    expect(source).toContain('const currentTournamentId = tournamentId.value')
    expect(source).toContain('const currentRound = Number(round.value)')
    expect(source).toContain('const currentTargetJudgeId = effectiveTargetJudgeId.value')
    expect(source).toContain('const currentSubmittedEntityId = submittedEntityId.value')
    expect(source).toContain('tournamentId.value !== currentTournamentId')
    expect(source).toContain('effectiveTargetJudgeId.value !== currentTargetJudgeId')
    expect(source).toContain('submittedEntityId.value !== currentSubmittedEntityId')
  })
})
