import { describe, expect, it } from 'vitest'
import {
  buildSlideRows,
  buildSubPrizeResultsFromCompiled,
  buildTieGroups,
  chunkSlideRows,
  normalizeSlideMax,
  parsePresentationQuery,
  resolveSubNames,
} from './slides-presentation'

describe('slides-presentation utils', () => {
  it('requires compiledId in presentation query', () => {
    const { parsed, errors } = parsePresentationQuery({ label: 'speakers', max: '5' })
    expect(parsed.compiledId).toBe('')
    expect(errors).toContain('missing_compiled_id')
  })

  it('maps legacy credit query to left credit', () => {
    const { parsed } = parsePresentationQuery({
      compiledId: 'compiled-1',
      credit: 'Legacy Credit',
    })
    expect(parsed.leftCredit).toBe('Legacy Credit')
    expect(parsed.rightCredit).toBe('')
  })

  it('keeps fallback max when value is empty', () => {
    expect(normalizeSlideMax(undefined, 7)).toBe(7)
    expect(normalizeSlideMax('', 5)).toBe(5)
  })

  it('builds rows with tie metadata and keeps boundary ties at max ranking', () => {
    const rows = buildSlideRows(
      [
        { id: 'a', name: 'A', ranking: 1 },
        { id: 'b', name: 'B', ranking: 1 },
        { id: 'c', name: 'C', ranking: 2 },
        { id: 'd', name: 'D', ranking: 3 },
        { id: 'e', name: 'E', ranking: 3 },
        { id: 'f', name: 'F', ranking: 4 },
      ],
      3
    )

    expect(rows.map((row) => row.id)).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(rows.find((row) => row.id === 'a')?.tie).toBe(true)
    expect(rows.find((row) => row.id === 'a')?.tieCount).toBe(2)
    expect(rows.find((row) => row.id === 'd')?.tie).toBe(true)
    expect(rows.find((row) => row.id === 'd')?.tieCount).toBe(2)

    const ties = buildTieGroups(rows)
    expect(ties.map((group) => group.ranking)).toEqual([1, 3])
  })

  it('chunks rows by listed/single page size', () => {
    const rows = buildSlideRows(
      [
        { id: 'a', name: 'A', ranking: 1 },
        { id: 'b', name: 'B', ranking: 2 },
        { id: 'c', name: 'C', ranking: 3 },
        { id: 'd', name: 'D', ranking: 4 },
        { id: 'e', name: 'E', ranking: 5 },
      ],
      5
    )

    const listed = chunkSlideRows(rows, 'listed')
    const single = chunkSlideRows(rows, 'single')

    expect(listed).toHaveLength(2)
    expect(listed[0]).toHaveLength(4)
    expect(single).toHaveLength(5)
    expect(single.every((chunk) => chunk.length === 1)).toBe(true)
  })

  it('resolves sub names with display-name resolver', () => {
    const resolved = resolveSubNames(['inst-1', 'inst-2'], (token) =>
      ({ 'inst-1': 'Inst One', 'inst-2': 'Inst Two' }[token] ?? token)
    )
    expect(resolved).toEqual(['Inst One', 'Inst Two'])
  })

  it('builds sub prize totals and ranking from compiled speaker details', () => {
    const rows = buildSubPrizeResultsFromCompiled(
      {
        compile_options: {
          duplicate_normalization: {
            poi_aggregation: 'average',
            best_aggregation: 'max',
          },
        },
        compiled_speaker_results: [
          {
            id: 's1',
            details: [
              {
                user_defined_data_collection: [
                  { poi: [{ value: true }, { value: false }] },
                  { poi: [{ value: true }, { value: true }] },
                ],
              },
            ],
          },
          {
            id: 's2',
            details: [
              {
                user_defined_data_collection: [{ poi: [{ value: true }] }],
              },
            ],
          },
        ],
      },
      'poi'
    )

    expect(rows).toHaveLength(2)
    expect(rows[0].id).toBe('s1')
    expect(rows[0].poi).toBeGreaterThan(rows[1].poi)
    expect(rows[0].ranking).toBe(1)
  })
})
