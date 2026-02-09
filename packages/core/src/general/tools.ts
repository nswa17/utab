import { DetailNotDefined } from './errors.js'
import { sillyLogger } from './loggers.js'

export interface RoundDetail {
  r: number
  available?: boolean
  speakers?: number[]
  // additional fields are allowed
  [key: string]: unknown
}

export interface IdentifiableWithDetails {
  id: number | string
  details: RoundDetail[]
}

export function findOne<T extends { id: number | string }>(list: T[], id: T['id']): T {
  const found = list.find((e) => e.id === id)
  if (!found) {
    throw new DetailNotDefined(id, Number.NaN)
  }
  return found
}

export function accessDetail<T extends IdentifiableWithDetails>(entity: T, r: number): RoundDetail {
  if (!entity.details || entity.details.length === 0) {
    throw new DetailNotDefined(entity.id, r)
  }
  const detail = entity.details.find((d) => d.r === r)
  if (!detail) {
    throw new DetailNotDefined(entity.id, r)
  }
  return detail
}

export function findAndAccessDetail<T extends IdentifiableWithDetails>(
  list: T[],
  id: T['id'],
  r: number
): RoundDetail {
  const entity = findOne(list, id)
  return accessDetail(entity, r)
}

export function filterAvailable<T extends IdentifiableWithDetails>(list: T[], r: number): T[] {
  return list.filter((entity) => accessDetail(entity, r).available)
}

export function checkDetail<T extends IdentifiableWithDetails>(entities: T[], r: number): void {
  sillyLogger(checkDetail, arguments, 'general')
  for (const entity of entities) {
    const hasDetail = entity.details?.some((detail) => detail.r === r)
    if (!hasDetail) {
      throw new DetailNotDefined(entity.id, r)
    }
  }
}
