import { toBooleanArray, toStringArray } from './array-coercion'

export type BallotPrefillPayload = {
  teamAId: string
  teamBId: string
  winnerId?: string
  draw?: boolean
  comment?: string
  speakerIdsA?: string[]
  speakerIdsB?: string[]
  scoresA?: number[]
  scoresB?: number[]
  matterA?: number[]
  mannerA?: number[]
  matterB?: number[]
  mannerB?: number[]
  bestA?: boolean[]
  bestB?: boolean[]
  poiA?: boolean[]
  poiB?: boolean[]
}

function toNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => Number(item)).filter((item) => Number.isFinite(item))
}

export function isCompleteSpeakerSelection(
  selection: string[],
  expectedCount: number,
  availableSpeakerIds: Iterable<string>
): boolean {
  const available = new Set(availableSpeakerIds)
  if (available.size === 0) return true
  const selected = selection.slice(0, expectedCount)
  return (
    selected.length === expectedCount &&
    selected.every((speakerId) => speakerId.length > 0 && available.has(speakerId))
  )
}

export function normalizeBallotPrefillPayload(
  payload: Record<string, unknown> | null,
  currentTeamAId: string,
  currentTeamBId: string
): BallotPrefillPayload | null {
  if (!payload) return null
  const sourceA = String(payload.teamAId ?? '')
  const sourceB = String(payload.teamBId ?? '')
  if (!sourceA || !sourceB) return null
  const direct = sourceA === currentTeamAId && sourceB === currentTeamBId
  const reverse = sourceA === currentTeamBId && sourceB === currentTeamAId
  if (!direct && !reverse) return null

  const winnerRaw = String(payload.winnerId ?? '')
  const drawSelected = payload.draw === true || (payload.draw === undefined && !winnerRaw)
  const winnerId =
    !drawSelected && (winnerRaw === sourceA || winnerRaw === sourceB) ? winnerRaw : ''
  const mapSide = <T,>(aValue: T, bValue: T): [T, T] =>
    reverse ? [bValue, aValue] : [aValue, bValue]

  const [speakerIdsAValue, speakerIdsBValue] = mapSide(
    toStringArray(payload.speakerIdsA),
    toStringArray(payload.speakerIdsB)
  )
  const [scoresAValue, scoresBValue] = mapSide(
    toNumberArray(payload.scoresA),
    toNumberArray(payload.scoresB)
  )
  const [matterAValue, matterBValue] = mapSide(
    toNumberArray(payload.matterA),
    toNumberArray(payload.matterB)
  )
  const [mannerAValue, mannerBValue] = mapSide(
    toNumberArray(payload.mannerA),
    toNumberArray(payload.mannerB)
  )
  const [bestAValue, bestBValue] = mapSide(
    toBooleanArray(payload.bestA),
    toBooleanArray(payload.bestB)
  )
  const [poiAValue, poiBValue] = mapSide(toBooleanArray(payload.poiA), toBooleanArray(payload.poiB))

  return {
    teamAId: currentTeamAId,
    teamBId: currentTeamBId,
    winnerId: winnerId || undefined,
    draw: drawSelected || undefined,
    comment: typeof payload.comment === 'string' ? payload.comment : undefined,
    speakerIdsA: speakerIdsAValue,
    speakerIdsB: speakerIdsBValue,
    scoresA: scoresAValue,
    scoresB: scoresBValue,
    matterA: matterAValue,
    mannerA: mannerAValue,
    matterB: matterBValue,
    mannerB: mannerBValue,
    bestA: bestAValue,
    bestB: bestBValue,
    poiA: poiAValue,
    poiB: poiBValue,
  }
}
