import { describe, it, expect } from 'vitest'
import {
  DoesNotExist,
  AlreadyExists,
  ResultNotSent,
  WinPointsDifferent,
  NeedMore,
  EntityNotRegistered,
  DetailNotDefined,
} from '../src/general/errors.js'

describe('general/errors', () => {
  it('populates DoesNotExist details', () => {
    const err = new DoesNotExist({ id: 1 })
    expect(err.name).toBe('DoesNotExist')
    expect(err.code).toBe(404)
    expect(err.message).toContain('"id":1')
  })

  it('populates AlreadyExists details', () => {
    const err = new AlreadyExists({ id: 2 })
    expect(err.name).toBe('AlreadyExists')
    expect(err.code).toBe(409)
    expect(err.message).toContain('"id":2')
  })

  it('populates ResultNotSent details', () => {
    const err = new ResultNotSent(3, 'speaker', 2)
    expect(err.name).toBe('ResultNotSent')
    expect(err.code).toBe(412)
    expect(err.message).toContain('speaker')
    expect(err.message).toContain('2')
  })

  it('populates WinPointsDifferent details', () => {
    const err = new WinPointsDifferent(4, [1, 0])
    expect(err.name).toBe('WinPointsDifferent')
    expect(err.code).toBe(412)
    expect(err.message).toContain('4')
    expect(err.message).toContain('1,0')
  })

  it('populates NeedMore details', () => {
    const err = new NeedMore('team', 2)
    expect(err.name).toBe('NeedMoreTeam')
    expect(err.code).toBe(412)
    expect(err.message).toContain('team')
    expect(err.message).toContain('2')
  })

  it('populates EntityNotRegistered details', () => {
    const err = new EntityNotRegistered(10, 'adjudicator', 1)
    expect(err.name).toBe('AdjudicatorNotRegistered')
    expect(err.code).toBe(412)
    expect(err.message).toContain('Adjudicator')
    expect(err.message).toContain('1')
  })

  it('populates DetailNotDefined details', () => {
    const err = new DetailNotDefined(7, 3)
    expect(err.name).toBe('DetailNotDefined')
    expect(err.code).toBe(412)
    expect(err.message).toContain('7')
    expect(err.message).toContain('3')
  })
})
