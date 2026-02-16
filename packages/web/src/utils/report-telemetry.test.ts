import { describe, expect, it, vi } from 'vitest'
import { ADMIN_REPORT_METRIC_EVENT, trackAdminReportMetric } from './report-telemetry'

describe('report telemetry', () => {
  it('dispatches an admin report metric event', () => {
    const handler = vi.fn()
    window.addEventListener(ADMIN_REPORT_METRIC_EVENT, handler as EventListener)
    const emitted = trackAdminReportMetric({
      metric: 'cta_click',
      cta: 'recompute',
      section: 'operations',
      tournamentId: 'tour-1',
    })
    expect(emitted).toBe(true)
    expect(handler).toHaveBeenCalledTimes(1)
    const event = handler.mock.calls[0]?.[0] as CustomEvent | undefined
    expect(event?.detail?.metric).toBe('cta_click')
    expect(event?.detail?.cta).toBe('recompute')
    expect(event?.detail?.source).toBe('admin_reports_v3')
    expect(typeof event?.detail?.timestamp).toBe('string')
    window.removeEventListener(ADMIN_REPORT_METRIC_EVENT, handler as EventListener)
  })
})
