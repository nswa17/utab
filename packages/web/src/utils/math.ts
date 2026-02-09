export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function disjoint<T>(list1: T[], list2: T[]): boolean {
  return list1.every((item) => !list2.includes(item))
}

export function wrapped<T>(list1: T[], list2: T[]): boolean {
  return list1.every((item) => list2.includes(item))
}

export function round(value: number, digits = 3): number {
  const factor = Math.pow(10, digits)
  return Math.round(value * factor) / factor
}

export function elapsedString(date1: Date, date2: Date): string {
  let hour = date1.getHours() - date2.getHours()
  let min = date1.getMinutes() - date2.getMinutes()
  let sec = date1.getSeconds() - date2.getSeconds()
  if (sec < 0) {
    sec += 60
    min -= 1
  }
  if (min < 0) {
    min += 60
    hour -= 1
  }
  const minStr = min < 10 ? `0${min}` : `${min}`
  const secStr = sec < 10 ? `0${sec}` : `${sec}`
  return `${hour === 0 ? '' : `${hour}°`}${minStr}′${secStr}″`
}

export function pairs<A, B>(list1: A[], list2: B[]): Array<[A, B]> {
  const result: Array<[A, B]> = []
  for (const left of list1) {
    for (const right of list2) {
      result.push([left, right])
    }
  }
  return result
}

export function count<T>(list: T[], target: T): number {
  return list.reduce((acc, cur) => (cur === target ? acc + 1 : acc), 0)
}

export function queryFromObj(obj: Record<string, string | number | boolean>): string {
  return Object.keys(obj)
    .map((key) => `${key}=${obj[key]}`)
    .join('&')
}

export function capitalize(value: string): string {
  return value.length === 0 ? value : value.charAt(0).toUpperCase() + value.slice(1)
}

export function sum(list: number[]): number {
  return list.reduce((acc, cur) => acc + cur, 0)
}

export function sumBool(list: boolean[]): number {
  return list.reduce((acc, cur) => acc + (cur ? 1 : 0), 0)
}

export function average(list: number[]): number {
  return list.length === 0 ? 0 : sum(list) / list.length
}

export function range(length: number): number[] {
  return [...Array(length).keys()]
}

export function common<T>(list1: T[], list2: T[]): T[] {
  return list1.filter((item) => list2.includes(item))
}

export function ordinal(order: number): string {
  const value = Math.round(order)
  const mod10 = value % 10
  const mod100 = value % 100
  if (mod10 === 1 && mod100 !== 11) return `${value}st`
  if (mod10 === 2 && mod100 !== 12) return `${value}nd`
  if (mod10 === 3 && mod100 !== 13) return `${value}rd`
  return `${value}th`
}

export function csvParser(file?: Blob): Promise<string[][]> {
  if (!file) return Promise.resolve([])
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result ?? '').trim()
      const rows =
        text === '' ? [] : text.split('\n').map((row) => row.split(',').map((cell) => cell.trim()))
      resolve(rows)
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
  })
}
