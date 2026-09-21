export type WizardProgress = {
  active: number
  furthest: number
}

export function normalizeWizardStepIndex(index: number, stepCount: number): number {
  if (stepCount <= 0) return 0
  return Math.min(Math.max(index, 0), stepCount - 1)
}

export function advanceWizardProgress(
  active: number,
  furthest: number,
  stepCount: number
): WizardProgress {
  const next = normalizeWizardStepIndex(active + 1, stepCount)
  return {
    active: next,
    furthest: Math.max(normalizeWizardStepIndex(furthest, stepCount), next),
  }
}

export function canVisitWizardStep(index: number, furthest: number): boolean {
  return index >= 0 && index <= furthest
}

export function isWizardStepCompleted(index: number, furthest: number): boolean {
  return index >= 0 && index < furthest
}
