import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function loadSource() {
  return readFileSync(resolve(process.cwd(), 'src/devtools/DevToolsBar.vue'), 'utf8')
}

describe('DevToolsBar', () => {
  it('disables actions when tournamentId is missing', () => {
    const source = loadSource()
    expect(source).toContain(':disabled="setupBusy || clearSetupBusy || !tournamentId"')
    expect(source).toContain(':disabled="roundBusy || !tournamentId || !resolvedRound"')
    expect(source).toContain('@click="onClearSetupEntities"')
    expect(source).toContain("onFillRoundSubmissions('ballot')")
    expect(source).toContain("onFillRoundSubmissions('feedback')")
  })

  it('stores API success responses and renders summary lines', () => {
    const source = loadSource()
    expect(source).toContain('copySummary.value = data')
    expect(source).toContain('fillSetupSummary.value = data')
    expect(source).toContain('clearSetupSummary.value = data')
    expect(source).toContain('fillRoundSummary.value = data')
    expect(source).toContain('fillModeLabel(fillRoundSummary.mode)')
    expect(source).toContain('roundBusyMode.value = mode')
    expect(source).toContain('clearRoundSummary.value = data')
    expect(source).toContain("requestCopyTournament(tournamentId.value)")
    expect(source).toContain("requestClearSetupEntities(tournamentId.value)")
    expect(source).toContain("requestClearRoundSubmissions(tournamentId.value")
    expect(source).toContain('v-if="copySummary"')
    expect(source).toContain('v-if="fillSetupSummary"')
    expect(source).toContain('v-if="clearSetupSummary"')
    expect(source).toContain('v-if="fillRoundSummary"')
    expect(source).toContain('v-if="clearRoundSummary"')
  })
})
