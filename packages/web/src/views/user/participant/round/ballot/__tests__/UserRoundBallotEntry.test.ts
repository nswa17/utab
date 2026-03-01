import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function load(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

describe('UserRoundBallotEntry winner selection rules', () => {
  it('requires explicit winner or draw selection before submit', () => {
    const source = load('src/views/user/participant/round/ballot/UserRoundBallotEntry.vue')
    expect(source).toContain('const winnerSelectionMade = computed(')
    expect(source).toContain('Boolean(effectiveWinnerId.value) || winnerDrawSelected.value')
    expect(source).toContain('const winnerDecisionError = computed(() => {')
    expect(source).toContain('if (!winnerSelectionMade.value) return winnerRequiredMessage.value')
    expect(source).toContain(
      "allowLowTieWin.value ? t('勝者または引き分けを選択してください。') : t('勝者を選択してください。')"
    )
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
    expect(source).toContain(
      'const submitButtonDisabled = computed(() => submissions.loading || !canSubmit.value)'
    )
    expect(source).not.toContain('winnerRequiredWarning')
    expect(source).not.toContain('submitError')
  })

  it('uses step-by-step flow before confirmation', () => {
    const source = load('src/views/user/participant/round/ballot/UserRoundBallotEntry.vue')
    expect(source).toContain("{{ $t('入力ステップ') }}")
    expect(source).toContain('const ballotSteps = computed<BallotStep[]>(() => {')
    expect(source).toContain('{{ nextActionLabel }}')
    expect(source).toContain('{{ previousActionLabel }}')
    expect(source).toContain("{{ $t('確認へ') }}")
    expect(source).toContain('function goToNextStep() {')
    expect(source).toContain('function goToPreviousStep() {')
    expect(source).toContain('function goToNextAction() {')
    expect(source).toContain('function goToPreviousAction() {')
  })

  it('places submitter step before speaker input', () => {
    const source = load('src/views/user/participant/round/ballot/UserRoundBallotEntry.vue')
    const submitterStep = "{ id: 'submitter', label: t('提出者入力'), title: t('提出者入力') }"
    const speakerStep = "{ id: 'speaker', label: t('Speaker入力'), title: t('Speaker入力') }"
    expect(source).toContain(submitterStep)
    expect(source).toContain(speakerStep)
    expect(source.indexOf(submitterStep)).toBeLessThan(source.indexOf(speakerStep))
    expect(source).toContain('if (isSubmitterStep.value) return submitterStepError.value')
    expect(source).toContain("if (!identityReady.value) return t('提出者ジャッジを選択してください。')")
  })

  it('supports role-by-role controls with steppers and switches', () => {
    const source = load('src/views/user/participant/round/ballot/UserRoundBallotEntry.vue')
    expect(source).toContain('const roleSequenceProgressText = computed(() => {')
    expect(source).toContain('function goToNextRole() {')
    expect(source).toContain('function goToPreviousRole() {')
    expect(source).toContain("t('前のロール')")
    expect(source).toContain("t('次のロール')")
    expect(source).toContain("adjustCurrentRoleNumeric('score', 1)")
    expect(source).toContain('<ToggleSwitch v-model="activeRoleBest"')
    expect(source).toContain('<ToggleSwitch v-model="activeRolePoi"')
  })
})
