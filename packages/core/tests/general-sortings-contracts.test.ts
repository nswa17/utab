import { describe, expect, it } from 'vitest'
import {
  adjudicatorComparer,
  adjudicatorSimpleComparer,
  speakerComparer,
  speakerSimpleComparer,
  teamComparer,
  teamSimpleComparer,
} from '../src/general/sortings.js'

describe('general/sortings comparator contracts', () => {
  const tieCases: Array<[string, () => number]> = [
    [
      'speakerSimpleComparer',
      () =>
        speakerSimpleComparer(
          [
            { id: 1, average: 75 },
            { id: 2, average: 75 },
          ],
          1,
          2
        ),
    ],
    [
      'teamSimpleComparer',
      () =>
        teamSimpleComparer(
          [
            { id: 1, win: 2 },
            { id: 2, win: 2 },
          ],
          1,
          2
        ),
    ],
    [
      'adjudicatorSimpleComparer',
      () =>
        adjudicatorSimpleComparer(
          [
            { id: 1, score: 8 },
            { id: 2, score: 8 },
          ],
          1,
          2
        ),
    ],
    [
      'speakerComparer',
      () =>
        speakerComparer(
          [
            { id: 1, sum: 150, average: 75 },
            { id: 2, sum: 150, average: 75 },
          ],
          1,
          2
        ),
    ],
    [
      'adjudicatorComparer',
      () =>
        adjudicatorComparer(
          [
            { id: 1, average: 8 },
            { id: 2, average: 8 },
          ] as any,
          1,
          2
        ),
    ],
    [
      'teamComparer',
      () =>
        teamComparer(
          [
            { id: 1, win: 2, sum: 300, margin: 10 },
            { id: 2, win: 2, sum: 300, margin: 10 },
          ],
          1,
          2
        ),
    ],
  ]

  it.each(tieCases)('%s returns 0 for a complete tie', (_name, compare) => {
    expect(compare()).toBe(0)
  })

  it('speakerComparer is antisymmetric when sum and average disagree', () => {
    const results = [
      { id: 1, sum: 140, average: 70 },
      { id: 2, sum: 80, average: 80 },
    ]

    const forward = speakerComparer(results, 1, 2)
    const reverse = speakerComparer(results, 2, 1)

    expect(Math.sign(forward)).toBe(-Math.sign(reverse))
  })
})
