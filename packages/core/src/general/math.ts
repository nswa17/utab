import seedrandom from 'seedrandom'
import { sillyLogger } from './loggers.js'

export function sum(list: number[]): number {
  return list.reduce((a, b) => a + b, 0)
}

export function average(list: number[]): number {
  return list.length === 0 ? 0 : sum(list) / list.length
}

export function sd(list: number[]): number {
  const avr = average(list)
  return Math.sqrt(average(list.map((x) => Math.pow(x - avr, 2))))
}

export function count<T>(list: T[], e: T): number {
  return list.filter((item) => e === item).length
}

export function countCommon<T>(list1: T[], list2: T[]): number {
  return sum(list1.map((e1) => count(list2, e1)))
}

export function adjustedSum(list: Array<number | null>): number {
  return sum(list.filter((x): x is number => x !== null))
}

export function adjustedAverage(list: Array<number | null>): number {
  return average(list.filter((x): x is number => x !== null))
}

export function adjustedSd(list: Array<number | null>): number {
  return sd(list.filter((x): x is number => x !== null))
}

export function isin<T>(e: T, list: T[]): boolean {
  for (const l of list) {
    if (l === e) {
      return true
    }
  }
  return false
}

export function subset<T>(list0: T[], list1: T[]): boolean {
  for (const e of list0) {
    if (!isin(e, list1)) {
      return false
    }
  }
  return true
}

function rand(seed?: string): number {
  const rng = seedrandom(seed)
  return rng()
}

export function shuffle<T>(list: T[], seed?: string): T[] {
  const array = [...list]
  let n = array.length
  while (n) {
    const i = Math.floor(rand(seed) * n--)
    const t = array[n]
    array[n] = array[i]
    array[i] = t
  }
  return array
}

export function permutator<T>(inputArr: T[]): T[][] {
  const results: T[][] = []

  function permute(arr: T[], memo: T[] = []): T[][] {
    for (let i = 0; i < arr.length; i++) {
      const cur = arr.splice(i, 1)
      if (arr.length === 0) {
        results.push([...memo, ...cur])
      }
      permute(arr.slice(), [...memo, ...cur])
      arr.splice(i, 0, cur[0])
    }
    return results
  }

  return permute(inputArr)
}

export function setMinus<T>(list1: T[], list2: T[]): T[] {
  const newList: T[] = []
  for (const e of list1) {
    if (!isin(e, list2)) {
      newList.push(e)
    }
  }
  return newList
}

export function combinations<T>(list: T[], r?: number): T[][] {
  const n = list.length
  const k = r ?? n

  if (k > n || k <= 0) return []
  if (k === n) return [list]
  if (k === 1) return list.map((item) => [item])

  const newList: T[][] = []
  for (let i = 0; i < n - k + 1; i++) {
    const head = list.slice(i, i + 1)
    const temp = combinations(list.slice(i + 1), k - 1)
    for (const combo of temp) {
      newList.push(head.concat(combo))
    }
  }
  return newList
}

export function logDistribution(values: number[], label = 'distribution'): void {
  sillyLogger(logDistribution, [values, label], 'general')
}
