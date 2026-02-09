import { sillyLogger } from './loggers.js'

export class DoesNotExist extends Error {
  readonly identity: unknown
  readonly code = 404

  constructor(identity: unknown) {
    const message = `The target with identity ${JSON.stringify(identity)} does not exist`
    super(message)
    this.name = 'DoesNotExist'
    this.identity = identity
    sillyLogger(DoesNotExist, arguments, 'general')
  }
}

export class AlreadyExists extends Error {
  readonly identity: unknown
  readonly code = 409

  constructor(identity: unknown) {
    const message = `The target with identity ${JSON.stringify(identity)} already exists`
    super(message)
    this.name = 'AlreadyExists'
    this.identity = identity
    sillyLogger(AlreadyExists, arguments, 'general')
  }
}

export class ResultNotSent extends Error {
  readonly id: number | string
  readonly role: string
  readonly r: number
  readonly code = 412

  constructor(id: number | string, role: string, r: number) {
    const message = `The result of ${role} ${id} in round ${r} is not sent`
    super(message)
    this.name = 'ResultNotSent'
    this.id = id
    this.role = role
    this.r = r
    sillyLogger(ResultNotSent, arguments, 'general')
  }
}

export class WinPointsDifferent extends Error {
  readonly id: number | string
  readonly wins: number | number[]
  readonly code = 412

  constructor(id: number | string, wins: number | number[]) {
    const message = `Win(Win-points) is not unified on team ${id}, win points(${wins})`
    super(message)
    this.name = 'WinPointsDifferent'
    this.id = id
    this.wins = wins
    sillyLogger(WinPointsDifferent, arguments, 'general')
  }
}

export class NeedMore extends Error {
  readonly role: string
  readonly atleast: number
  readonly code = 412

  constructor(role: string, atleast: number) {
    const capitalized = role.charAt(0).toUpperCase() + role.slice(1)
    const message = `At least ${atleast} more available ${role}s are needed`
    super(message)
    this.name = `NeedMore${capitalized}`
    this.role = role
    this.atleast = atleast
    sillyLogger(NeedMore, arguments, 'general')
  }
}

export class EntityNotRegistered extends Error {
  readonly id: number | string
  readonly role: string
  readonly r: number
  readonly code = 412

  constructor(id: number | string, role: string, r: number) {
    const capitalized = role.charAt(0).toUpperCase() + role.slice(1)
    const message = `${capitalized} ${id} is not defined in round ${r}`
    super(message)
    this.name = `${capitalized}NotRegistered`
    this.id = id
    this.role = role
    this.r = r
    sillyLogger(EntityNotRegistered, arguments, 'general')
  }
}

export class DetailNotDefined extends Error {
  readonly id: number | string
  readonly r: number
  readonly code = 412

  constructor(id: number | string, r: number) {
    const message = `details of id(${id}) in round ${r} is not defined`
    super(message)
    this.name = 'DetailNotDefined'
    this.id = id
    this.r = r
    sillyLogger(DetailNotDefined, arguments, 'general')
  }
}
