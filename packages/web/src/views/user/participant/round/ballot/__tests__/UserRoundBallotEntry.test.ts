import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { messages } from '@/i18n/messages'

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
    expect(source).toContain('const awardSelectionError = computed(() => {')
    expect(source).toContain('validateAwardSelectionCounts(')
    expect(source).toContain("t('ベストディベーターは{min}〜{max}人選択してください。'")
    expect(source).toContain("t('POIは{min}〜{max}人選択してください。'")
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
    expect(source).toContain('function goToStep(index: number) {')
    expect(source).toContain('function canGoToStep(index: number) {')
    expect(source).toContain(':disabled="!canGoToStep(index)"')
    expect(source).toContain('return index <= activeStepIndex.value')
    expect(source).toContain('@click="goToStep(index)"')
    expect(source).toContain(":aria-current=\"index === activeStepIndex ? 'step' : undefined\"")
    expect(source).toContain('function goToNextAction() {')
    expect(source).toContain('function goToPreviousAction() {')
  })

  it('places submitter step before speaker input', () => {
    const source = load('src/views/user/participant/round/ballot/UserRoundBallotEntry.vue')
    const submitterStep = "{ id: 'submitter', label: t('提出者入力'), title: t('提出者入力') }"
    const speakerStep = "{ id: 'speaker', label: t('スピーカー入力'), title: t('スピーカー入力') }"
    expect(source).toContain(submitterStep)
    expect(source).toContain(speakerStep)
    expect(source.indexOf(submitterStep)).toBeLessThan(source.indexOf(speakerStep))
    expect(source).toContain('if (isSubmitterStep.value) return submitterStepError.value')
    expect(source).toContain("if (!identityReady.value) return t('提出者ジャッジを選択してください。')")
  })

  it('supports role-by-role controls with steppers and large explicit award choices', () => {
    const source = load('src/views/user/participant/round/ballot/UserRoundBallotEntry.vue')
    expect(source).toContain('const roleSequenceProgressText = computed(() => {')
    expect(source).toContain('buildSpeakerRoleSequence(style.value?.speaker_sequence')
    expect(source).toContain('function goToNextRole() {')
    expect(source).toContain('function goToPreviousRole() {')
    expect(source).toContain("t('前のロール')")
    expect(source).toContain("t('次のロール')")
    expect(source).toContain("adjustCurrentRoleNumeric('score', 1)")
    expect(source).toContain('class="award-choice"')
    expect(source).toContain('class="award-choice-option"')
    expect(source).toContain(':aria-pressed="activeRoleBest"')
    expect(source).toContain(':aria-pressed="activeRolePoi"')
    expect(source).toContain('min-height: 44px;')
    expect(source).toContain('touch-action: manipulation;')
  })

  it('shows per-speaker scores and awards in the confirmation modal', () => {
    const source = load('src/views/user/participant/round/ballot/UserRoundBallotEntry.vue')
    expect(source).toContain("{{ $t('スピーカー別内訳') }}")
    expect(source).toContain('const confirmSpeakerTeams = computed(() => [')
    expect(source).toContain('function buildConfirmSpeakerRows(')
    expect(source).toContain("t('マター {matter} / マナー {manner}',")
    expect(source).toContain("$t('付与なし')")
    expect(source).toContain('@click="editConfirmSpeaker(row)"')
    expect(source).toContain('function editConfirmSpeaker(row: ConfirmSpeakerRow)')
    expect(source).toContain('preserveRoleCursorOnScoreStep')
    expect(source).toContain('const returnToConfirmAfterEdit = ref(false)')
    expect(source).toContain('v-if="returnToConfirmAfterEdit"')
    expect(source).toContain('@click="returnToConfirmation"')
    expect(source).toContain('function returnToConfirmation()')
    expect(source).toContain('const selectedAwardSummaryRows = computed<SelectedAwardSummaryRow[]>(() =>')
  })

  it('defines interpolation messages used by the confirmation modal', () => {
    expect(messages.en['マター {matter} / マナー {manner}']).toBe('Matter {matter} / Manner {manner}')
    expect(messages.en['{score}点']).toBe('{score} pts')
    expect(messages.en['合計 {score}点']).toBe('Total {score} pts')
    expect(messages.en['付与なし']).toBe('No award')
  })

  it('shows the submitted winner in the completion dialog', () => {
    const source = load('src/views/user/participant/round/ballot/UserRoundBallotEntry.vue')
    expect(source).toContain("{{ $t('あなたの投票') }}")
    expect(source).toContain('<strong>{{ winnerName }}</strong>')
    expect(source).toContain("{{ $t('選択した賞') }}")
    expect(source).toContain('selectedAwardSummaryRows.length > 0')
    expect(messages.en['あなたの投票']).toBe('Your decision')
    expect(messages.en['選択した賞']).toBe('Selected awards')
  })

  it('defines English labels for every participant ballot step and status line', () => {
    expect(messages.en['提出者入力']).toBe('Select submitter')
    expect(messages.en['提出者ジャッジ']).toBe('Submitting adjudicator')
    expect(messages.en['入力ステップ']).toBe('Entry steps')
    expect(messages.en['評価タイプ']).toBe('Evaluation type')
    expect(messages.en['確認へ']).toBe('Review')
    expect(messages.en['確認画面に戻る']).toBe('Back to review')
    expect(messages.en['次へ']).toBe('Next')
    expect(messages.en['現在の合計: {gov} {govScore} / {opp} {oppScore}']).toBe(
      'Current total: {gov} {govScore} / {opp} {oppScore}'
    )
    expect(messages.en['ロール {current} / {total}']).toBe('Role {current} / {total}')
  })
})
