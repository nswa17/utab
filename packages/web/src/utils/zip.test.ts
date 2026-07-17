import { describe, expect, it } from 'vitest'
import { createZip } from './zip'

const decoder = new TextDecoder('utf-8', { ignoreBOM: true })

function readLocalFileEntries(zip: Uint8Array) {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
  const entries: Array<{ name: string; data: string }> = []
  let offset = 0

  while (view.getUint32(offset, true) === 0x04034b50) {
    const size = view.getUint32(offset + 18, true)
    const nameLength = view.getUint16(offset + 26, true)
    const extraLength = view.getUint16(offset + 28, true)
    const nameStart = offset + 30
    const dataStart = nameStart + nameLength + extraLength
    entries.push({
      name: decoder.decode(zip.slice(nameStart, nameStart + nameLength)),
      data: decoder.decode(zip.slice(dataStart, dataStart + size)),
    })
    offset = dataStart + size
  }

  return entries
}

describe('createZip', () => {
  it('creates a ZIP with each CSV file stored as UTF-8 data', () => {
    const zip = createZip([
      { name: 'team_results.csv', data: '\ufeff順位,名前\n1,Example' },
      { name: 'participants.csv', data: '\ufeff種別,名前\nteam,Example' },
    ])

    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
    expect(view.getUint32(0, true)).toBe(0x04034b50)
    expect(view.getUint32(zip.length - 22, true)).toBe(0x06054b50)
    expect(readLocalFileEntries(zip)).toEqual([
      { name: 'team_results.csv', data: '\ufeff順位,名前\n1,Example' },
      { name: 'participants.csv', data: '\ufeff種別,名前\nteam,Example' },
    ])
  })

  it('rejects duplicate entry names', () => {
    expect(() => createZip([{ name: 'results.csv', data: '' }, { name: 'results.csv', data: '' }])).toThrow(
      'duplicate file name'
    )
  })
})
