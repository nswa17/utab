import { describe, expect, it } from 'vitest'

import {
  allocationDragHighlightToneForIds,
  buildAllocationDragHighlightIndex,
} from '@/utils/allocation-drag-highlights'

describe('allocation-drag-highlights', () => {
  it('marks conflict and history targets while dragging a team', () => {
    const index = buildAllocationDragHighlightIndex({
      drag: { kind: 'team', id: 'team-a' },
      teamIds: ['team-a', 'team-b', 'team-c'],
      adjudicatorIds: ['adj-a', 'adj-b', 'adj-c'],
      teamInstitutions: (teamId) => {
        if (teamId === 'team-a') return ['inst-1']
        if (teamId === 'team-b') return ['inst-1']
        return []
      },
      adjudicatorInstitutions: (adjudicatorId) => {
        if (adjudicatorId === 'adj-a') return ['inst-1']
        return []
      },
      adjudicatorConflicts: (adjudicatorId) => {
        if (adjudicatorId === 'adj-b') return ['team-a']
        return []
      },
      teamPastOpponents: (teamId) => {
        if (teamId === 'team-a') return ['team-c']
        return []
      },
      adjudicatorJudgedTeams: (adjudicatorId) => {
        if (adjudicatorId === 'adj-c') return ['team-a']
        return []
      },
    })

    expect(allocationDragHighlightToneForIds(index, 'team', ['team-b'])).toBe('conflict')
    expect(allocationDragHighlightToneForIds(index, 'team', ['team-c'])).toBe('history')
    expect(allocationDragHighlightToneForIds(index, 'adjudicator', ['adj-a'])).toBe('conflict')
    expect(allocationDragHighlightToneForIds(index, 'adjudicator', ['adj-b'])).toBe('conflict')
    expect(allocationDragHighlightToneForIds(index, 'adjudicator', ['adj-c'])).toBe('history')
    expect(allocationDragHighlightToneForIds(index, 'team', ['team-a'])).toBeNull()
  })

  it('prioritizes conflict over history while dragging an adjudicator', () => {
    const index = buildAllocationDragHighlightIndex({
      drag: { kind: 'adjudicator', id: 'adj-a' },
      teamIds: ['team-a', 'team-b'],
      adjudicatorIds: ['adj-a', 'adj-b'],
      teamInstitutions: (teamId) => {
        if (teamId === 'team-a') return ['inst-1']
        return []
      },
      adjudicatorInstitutions: (adjudicatorId) => {
        if (adjudicatorId === 'adj-a' || adjudicatorId === 'adj-b') return ['inst-1']
        return []
      },
      adjudicatorConflicts: (adjudicatorId) => {
        if (adjudicatorId === 'adj-a') return ['team-a', 'team-b']
        return []
      },
      teamPastOpponents: () => [],
      adjudicatorJudgedTeams: (adjudicatorId) => {
        if (adjudicatorId === 'adj-a') return ['team-b']
        return []
      },
    })

    expect(allocationDragHighlightToneForIds(index, 'team', ['team-a'])).toBe('conflict')
    expect(allocationDragHighlightToneForIds(index, 'team', ['team-b'])).toBe('conflict')
    expect(allocationDragHighlightToneForIds(index, 'adjudicator', ['adj-b'])).toBe('conflict')
  })
})
