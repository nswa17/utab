import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function load(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

describe('UserRoundBallotEntry winner selection rules', () => {
  it('requires explicit winner or draw selection before submit', () => {
    const source = load('src/views/user/participant/round/ballot/UserRoundBallotEntry.vue')
    expect(source).toContain('const winnerSelectionMade = computed(() => Boolean(effectiveWinnerId.value) || winnerDrawSelected.value)')
    expect(source).toContain('if (!winnerSelectionMade.value) return false')
    expect(source).toContain('if (!winnerSelectionMade.value) {')
    expect(source).toContain("allowLowTieWin.value ? t('勝者または引き分けを選択してください。') : t('勝者を選択してください。')")
  })

  it('does not show implicit draw hint text', () => {
    const source = load('src/views/user/participant/round/ballot/UserRoundBallotEntry.vue')
    expect(source).not.toContain('未選択で引き分けとして送信できます。')
    expect(source).not.toContain('canSubmitDrawWithoutWinner')
  })
})
