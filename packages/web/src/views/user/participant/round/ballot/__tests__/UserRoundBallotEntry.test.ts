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
    expect(source).toContain('const winnerDecisionError = computed(() => {')
    expect(source).toContain('if (!winnerSelectionMade.value) return winnerRequiredMessage.value')
    expect(source).toContain("allowLowTieWin.value ? t('勝者または引き分けを選択してください。') : t('勝者を選択してください。')")
    expect(source).toContain("return t('引き分けは同点時のみ選択できます。')")
    expect(source).toContain("return t('勝者は点数の大小と一致させてください。')")
  })

  it('does not show implicit draw hint text', () => {
    const source = load('src/views/user/participant/round/ballot/UserRoundBallotEntry.vue')
    expect(source).not.toContain('未選択で引き分けとして送信できます。')
    expect(source).not.toContain('canSubmitDrawWithoutWinner')
  })

  it('shows a single validation error and disables submit while invalid', () => {
    const source = load('src/views/user/participant/round/ballot/UserRoundBallotEntry.vue')
    expect(source).toContain(':disabled="submitButtonDisabled"')
    expect(source).toContain('<p v-if="validationError" class="error">{{ validationError }}</p>')
    expect(source).toContain('const validationError = computed(() => {')
    expect(source).toContain('const submitButtonDisabled = computed(() => submissions.loading || !canSubmit.value)')
    expect(source).not.toContain('winnerRequiredWarning')
    expect(source).not.toContain('submitError')
  })
})
