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

  let remaining = [...ts]
  while (remaining.length > 1) {
    const ap = remaining[0]
    for (let i = rankPointers[ap]; i < ranks[ap].length; i++) {
      const op = ranks[ap][i]
      if (matching[op].length < cap || isBetter(ranks, op, matching[op], ap)) {
        if (matching[op].length === cap) {
          const maxRankMatcher = getMaxRankMatcher(ranks, op, matching[op])
          rankPointers[maxRankMatcher] += 1
          matching[maxRankMatcher] = matching[maxRankMatcher].filter((n) => n !== op)
          matching[op] = matching[op].filter((n) => n !== maxRankMatcher)
        }
        matching[ap].push(op)
        matching[op].push(ap)
        break
      }
      rankPointers[ap] += 1
    }
    remaining = ts.filter((t) => matching[t].length < cap)
  }
  return matching
}

export default { mGaleShapley }
