import { sillyLogger } from '../../general/loggers.js'

export function galeShapley(
  gs: number[],
  as: number[],
  gRanks: Record<number, number[]>,
  aRanks: Record<number, number[]>,
  cap = 1
): Record<number, number[]> {
  sillyLogger(galeShapley, arguments, 'draws')
  const gRanksPointers: Record<number, number> = {}
  const gMatched: Record<number, number[]> = {}
  const aMatched: Record<number, number | null> = {}
  let remaining = [...gs]

  for (const g of gs) {
    gRanksPointers[g] = 0
    gMatched[g] = []
  }
  for (const a of as) {
    aMatched[a] = null
  }

  if (cap === 0) return gMatched
  if (gs.length > as.length) {
    throw new Error('gs must be fewer than as')
  }

  while (remaining.length > 0) {
    const pro = remaining[0]
    const rec = gRanks[pro][gRanksPointers[pro]]

    if (aMatched[rec] === null || aRanks[rec].indexOf(pro) < aRanks[rec].indexOf(aMatched[rec]!)) {
      if (aMatched[rec] !== null) {
        gRanksPointers[aMatched[rec]!] += 1
        gMatched[aMatched[rec]!] = gMatched[aMatched[rec]!].filter((id) => id !== rec)
      }
      aMatched[rec] = pro
      gMatched[pro].push(rec)
    } else {
      gRanksPointers[pro] += 1
    }
    remaining = gs.filter((g) => gMatched[g].length < cap && gRanksPointers[g] < gRanks[g].length)
  }
  return gMatched
}

export default { galeShapley }
