import { describe, expect, it } from 'vitest'
import { readTournamentAccessState, resolveTournamentAccessForm } from './tournament-access'

describe('tournament access helpers', () => {
  it('treats hash-only access config as protected without exposing a password value', () => {
    expect(
      readTournamentAccessState({
        access: {
          required: true,
          hasPassword: true,
        },
      })
    ).toEqual({
      required: true,
      password: '',
      hasPassword: true,
    })
  })

  it('clears stale password input when the server only reports that a password exists', () => {
    expect(
      resolveTournamentAccessForm(
        {
          access: {
            required: true,
            hasPassword: true,
          },
        },
        'stale-secret'
      )
    ).toEqual({
      required: true,
      password: '',
    })
  })

  it('can preserve the current password input immediately after save when requested', () => {
    expect(
      resolveTournamentAccessForm(
        {
          access: {
            required: true,
            hasPassword: true,
          },
        },
        'new-secret',
        { preserveExistingPassword: true }
      )
    ).toEqual({
      required: true,
      password: 'new-secret',
    })
  })
})
