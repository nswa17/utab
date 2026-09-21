import { describe, expect, it } from 'vitest'
import { createTournamentStoreScope } from './tournament-store-scope'

describe('tournament store scope', () => {
  it('invalidates an old A token after A -> B -> A activation', () => {
    const scope = createTournamentStoreScope()
    scope.activate('tournament-a')
    const oldA = scope.captureScope('tournament-a')

    scope.activate('tournament-b')
    scope.activate('tournament-a')

    expect(scope.isActive('tournament-a')).toBe(true)
    expect(scope.isScopeCurrent(oldA)).toBe(false)
    expect(scope.isScopeCurrent(scope.captureScope('tournament-a'))).toBe(true)
  })

  it('invalidates an old fetch token after returning to the same tournament', () => {
    const scope = createTournamentStoreScope()
    const first = scope.beginFetch('tournament-a').token
    scope.beginFetch('tournament-b')
    scope.activate('tournament-a')

    expect(scope.isFetchCurrent(first)).toBe(false)
  })

  it('invalidates captured work when the scope is cleared', () => {
    const scope = createTournamentStoreScope()
    scope.claimIfEmpty('tournament-a')
    const token = scope.captureScope('tournament-a')
    scope.clear()
    expect(scope.isScopeCurrent(token)).toBe(false)
  })
})
