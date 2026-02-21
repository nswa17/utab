import { nextTick, ref } from 'vue'
import { beforeEach, describe, expect, it } from 'vitest'
import { useReportSlideSettings } from './useReportSlideSettings'

describe('useReportSlideSettings', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('persists and restores per-label settings', async () => {
    const tournamentId = ref('tour-1')
    const first = useReportSlideSettings(tournamentId)

    first.setSlideLabel('speakers')
    first.updateSlideSettings('speakers', {
      maxRankingRewarded: 6,
      type: 'single',
      style: 'simple',
      credit: 'Speaker Credits',
    })
    await nextTick()

    const second = useReportSlideSettings(tournamentId)
    await nextTick()

    expect(second.slideLabel.value).toBe('speakers')
    expect(second.settingsByLabel.value.speakers.maxRankingRewarded).toBe(6)
    expect(second.settingsByLabel.value.speakers.type).toBe('single')
    expect(second.settingsByLabel.value.speakers.style).toBe('simple')
    expect(second.settingsByLabel.value.speakers.credit).toBe('Speaker Credits')
  })

  it('uses defaults when storage is malformed', async () => {
    localStorage.setItem('utab:reports:slides:v1:tour-2', '{ invalid json')
    const tournamentId = ref('tour-2')
    const state = useReportSlideSettings(tournamentId)
    await nextTick()

    expect(state.slideLabel.value).toBe('teams')
    expect(state.settingsByLabel.value.teams.maxRankingRewarded).toBe(3)
    expect(state.settingsByLabel.value.teams.type).toBe('listed')
    expect(state.settingsByLabel.value.teams.style).toBe('pretty')
    expect(state.settingsByLabel.value.teams.credit).toBe('UTab')
  })

  it('resets to defaults when stored version is unsupported', async () => {
    localStorage.setItem(
      'utab:reports:slides:v1:tour-3',
      JSON.stringify({
        version: 999,
        lastLabel: 'poi',
        settings: {
          poi: { maxRankingRewarded: 9, type: 'single', style: 'simple', credit: 'x' },
        },
      })
    )

    const tournamentId = ref('tour-3')
    const state = useReportSlideSettings(tournamentId)
    await nextTick()

    expect(state.slideLabel.value).toBe('teams')
    expect(state.settingsByLabel.value.poi.maxRankingRewarded).toBe(3)
    expect(state.settingsByLabel.value.poi.type).toBe('listed')
    expect(state.settingsByLabel.value.poi.style).toBe('pretty')
    expect(state.settingsByLabel.value.poi.credit).toBe('UTab')
  })

  it('migrates legacy type-only style values', async () => {
    localStorage.setItem(
      'utab:reports:slides:v1:tour-4',
      JSON.stringify({
        version: 1,
        lastLabel: 'teams',
        settings: {
          teams: { maxRankingRewarded: 5, type: 'simple', credit: 'legacy' },
        },
      })
    )

    const tournamentId = ref('tour-4')
    const state = useReportSlideSettings(tournamentId)
    await nextTick()

    expect(state.settingsByLabel.value.teams.type).toBe('single')
    expect(state.settingsByLabel.value.teams.style).toBe('simple')
  })

  it('does not reset max ranking when updating type/style only', async () => {
    const tournamentId = ref('tour-5')
    const state = useReportSlideSettings(tournamentId)

    state.updateSlideSettings('teams', { maxRankingRewarded: 8 })
    state.updateSlideSettings('teams', { type: 'single' })
    state.updateSlideSettings('teams', { style: 'simple' })
    await nextTick()

    expect(state.settingsByLabel.value.teams.maxRankingRewarded).toBe(8)
  })
})
