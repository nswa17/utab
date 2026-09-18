import { sillyLogger } from '../../general/loggers.js'

function getMaxRankMatcher(ranks: Record<number, number[]>, op: number, matched: number[]): number {
  const matchedRanks = matched.map((m) => ranks[op].indexOf(m))
  const maxRank = matchedRanks.reduce((a, b) => Math.max(a, b), -Infinity)
  return matched.filter((m) => ranks[op].indexOf(m) === maxRank)[0]
}

function isBetter(
  ranks: Record<number, number[]>,
  op: number,
  matched: number[],
  ap: number
): boolean {
  const maxRankMatcher = getMaxRankMatcher(ranks, op, matched)
  return ranks[op].indexOf(ap) < ranks[op].indexOf(maxRankMatcher)
}

export function mGaleShapley(
  ts: number[],
  ranks: Record<number, number[]>,
  cap = 1
): Record<number, number[]> {
  sillyLogger(mGaleShapley, arguments, 'draws')
  const matching: Record<number, number[]> = {}
  const rankPointers: Record<number, number> = {}
  for (const t of ts) {
    matching[t] = []
    rankPointers[t] = 0
  }

  // Each proposal advances exactly one pointer. This gives a finite upper
  // bound of sum(ranks[t].length) proposals and prevents a team from
  // repeatedly adding the same opponent when cap > 1.
  while (true) {
    const ap = ts.find(
      (teamId) =>
        matching[teamId].length < cap &&
        rankPointers[teamId] < (ranks[teamId]?.length ?? 0)
    )
    if (ap === undefined) break

    const op = ranks[ap]?.[rankPointers[ap]]
    rankPointers[ap] += 1
    if (
      op === undefined ||
      op === ap ||
      matching[op] === undefined ||
      matching[ap].includes(op)
    ) {
      continue
    }

    if (matching[op].length < cap) {
      matching[ap].push(op)
      matching[op].push(ap)
      continue
    }

    if (!isBetter(ranks, op, matching[op], ap)) continue

    const displaced = getMaxRankMatcher(ranks, op, matching[op])
    matching[displaced] = matching[displaced].filter((id) => id !== op)
    matching[op] = matching[op].filter((id) => id !== displaced)
    matching[ap].push(op)
    matching[op].push(ap)
  }

  return matching
}

export default { mGaleShapley }
