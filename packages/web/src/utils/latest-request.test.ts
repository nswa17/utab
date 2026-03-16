import { describe, expect, it } from 'vitest'
import { createLatestRequestGate } from './latest-request'

describe('latest request gate', () => {
  it('marks only the newest token as current', () => {
    const gate = createLatestRequestGate()

    const first = gate.begin()
    const second = gate.begin()

    expect(gate.isCurrent(first)).toBe(false)
    expect(gate.isCurrent(second)).toBe(true)
  })

  it('tracks pending requests while overlapping requests complete', () => {
    const gate = createLatestRequestGate()

    const first = gate.begin()
    const second = gate.begin()

    expect(gate.complete(first)).toEqual({
      isCurrent: false,
      hasPending: true,
    })
    expect(gate.complete(second)).toEqual({
      isCurrent: true,
      hasPending: false,
    })
  })

  it('invalidates older tokens without adding fake pending requests', () => {
    const gate = createLatestRequestGate()

    const first = gate.begin()
    gate.invalidate()

    expect(gate.isCurrent(first)).toBe(false)
    expect(gate.complete(first)).toEqual({
      isCurrent: false,
      hasPending: false,
    })
  })
})
