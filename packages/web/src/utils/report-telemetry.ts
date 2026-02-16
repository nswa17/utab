export type AdminReportSection = 'operations' | 'fairness' | 'announcement' | 'analysis'

export type AdminReportMetric = 'tab_enter' | 'tab_leave' | 'cta_click' | 'export_complete'

export const ADMIN_REPORT_METRIC_EVENT = 'utab:admin-report-metric'

export type AdminReportMetricPayload = {
  metric: AdminReportMetric
  tournamentId?: string
  section?: AdminReportSection
  cta?: string
  exportType?: string
  rowCount?: number
  dwellMs?: number
  reason?: string
}

type AdminReportMetricDetail = AdminReportMetricPayload & {
  source: 'admin_reports_v3'
  timestamp: string
}

export function trackAdminReportMetric(payload: AdminReportMetricPayload): boolean {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return false
  const detail: AdminReportMetricDetail = {
    ...payload,
    source: 'admin_reports_v3',
    timestamp: new Date().toISOString(),
  }
  window.dispatchEvent(new CustomEvent(ADMIN_REPORT_METRIC_EVENT, { detail }))
  return true
}
