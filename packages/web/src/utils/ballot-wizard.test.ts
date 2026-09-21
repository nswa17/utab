import { describe, expect, it } from 'vitest'
import {
  advanceWizardProgress,
  canVisitWizardStep,
  isWizardStepCompleted,
  normalizeWizardStepIndex,
} from './ballot-wizard'

describe('ballot wizard progress helpers', () => {
  it('keeps previously reached steps revisitable after moving backward', () => {
    let progress = { active: 0, furthest: 0 }
    progress = advanceWizardProgress(progress.active, progress.furthest, 4)
    progress = advanceWizardProgress(progress.active, progress.furthest, 4)

    expect(progress).toEqual({ active: 2, furthest: 2 })

    const activeAfterBack = normalizeWizardStepIndex(progress.active - 1, 4)
    expect(activeAfterBack).toBe(1)
    expect(canVisitWizardStep(2, progress.furthest)).toBe(true)
    expect(isWizardStepCompleted(1, progress.furthest)).toBe(true)
  })

  it('clamps both active and furthest progress when the step list shrinks', () => {
    const progress = advanceWizardProgress(3, 3, 2)
    expect(progress).toEqual({ active: 1, furthest: 1 })
    expect(normalizeWizardStepIndex(3, 2)).toBe(1)
  })

  it('does not expose negative or never-reached steps', () => {
    expect(normalizeWizardStepIndex(-3, 4)).toBe(0)
    expect(canVisitWizardStep(-1, 2)).toBe(false)
    expect(canVisitWizardStep(3, 2)).toBe(false)
    expect(isWizardStepCompleted(-1, 2)).toBe(false)
  })
})
