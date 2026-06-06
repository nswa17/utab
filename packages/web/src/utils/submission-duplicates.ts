function normalizeToken(value: unknown): string {
  return String(value ?? '').trim()
}

function normalizeTeamPairKey(teamAId: unknown, teamBId: unknown): string {
  const left = normalizeToken(teamAId)
  const right = normalizeToken(teamBId)
  if (!left || !right) return ''
  return [left, right].sort().join('::')
}

function submissionActorId(item: any) {
  const payloadEntityId = normalizeToken(item?.payload?.submittedEntityId)
  if (payloadEntityId) return payloadEntityId
  return normalizeToken(item?.submittedBy)
}

function duplicateOverflow(counts: Map<string, number>) {
  return Array.from(counts.values()).reduce(
    (total, count) => total + (count > 1 ? count - 1 : 0),
    0
  )
}

export function countDuplicateSubmissions(items: any[]) {
  const ballotCountByKey = new Map<string, number>()
  const feedbackCountByKey = new Map<string, number>()

  items.forEach((item) => {
    const round = Number(item?.round)
    if (!Number.isFinite(round)) return
    const actor = submissionActorId(item)
    if (!actor) return
    if (item?.type === 'ballot') {
      const pairKey = normalizeTeamPairKey(item?.payload?.teamAId, item?.payload?.teamBId)
      if (!pairKey) return
      const key = `${round}:${actor}:${pairKey}`
      ballotCountByKey.set(key, (ballotCountByKey.get(key) ?? 0) + 1)
      return
    }
    if (item?.type === 'feedback') {
      const adjudicatorId = normalizeToken(item?.payload?.adjudicatorId)
      if (!adjudicatorId) return
      const key = `${round}:${actor}:${adjudicatorId}`
      feedbackCountByKey.set(key, (feedbackCountByKey.get(key) ?? 0) + 1)
    }
  })

  return {
    ballotDuplicates: duplicateOverflow(ballotCountByKey),
    feedbackDuplicates: duplicateOverflow(feedbackCountByKey),
  }
}
