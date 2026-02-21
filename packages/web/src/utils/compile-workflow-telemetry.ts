export type CompileWorkflowMetric =
  | 'preview_run'
  | 'save_snapshot'
  | 'save_blocked_stale'
  | 'save_cancelled'

export type CompileWorkflowScreen = 'operations' | 'reports'

export const ADMIN_COMPILE_WORKFLOW_EVENT = 'utab:admin-compile-workflow-metric'

export type CompileWorkflowMetricPayload = {
  metric: CompileWorkflowMetric
  tournamentId?: string
  screen?: CompileWorkflowScreen
  source?: 'submissions' | 'raw'
  reason?: string
}

type CompileWorkflowMetricDetail = CompileWorkflowMetricPayload & {
  source_tag: 'admin_compile_manual_save_v1'
  timestamp: string
}

export function trackAdminCompileWorkflowMetric(payload: CompileWorkflowMetricPayload): boolean {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return false
  const detail: CompileWorkflowMetricDetail = {
    ...payload,
    source_tag: 'admin_compile_manual_save_v1',
    timestamp: new Date().toISOString(),
  }
  window.dispatchEvent(new CustomEvent(ADMIN_COMPILE_WORKFLOW_EVENT, { detail }))
  return true
}
