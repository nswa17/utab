export type ZipEntry = {
  name: string
  data: string | Uint8Array
}

type ZipEntryMetadata = {
  name: Uint8Array
  data: Uint8Array
  crc: number
  offset: number
}

const encoder = new TextEncoder()
const UTF8_FLAG = 0x0800
const STORE_METHOD = 0
const VERSION_NEEDED = 20
const VERSION_MADE_BY = 20
const MAX_UINT16 = 0xffff
const MAX_UINT32 = 0xffffffff

function toBytes(value: string | Uint8Array): Uint8Array {
  return typeof value === 'string' ? encoder.encode(value) : value
}

function assertUint16(value: number, label: string) {
  if (!Number.isInteger(value) || value < 0 || value > MAX_UINT16) {
    throw new Error(`${label} must fit in an unsigned 16-bit integer`)
  }
}

function assertUint32(value: number, label: string) {
  if (!Number.isInteger(value) || value < 0 || value > MAX_UINT32) {
    throw new Error(`${label} must fit in an unsigned 32-bit integer`)
  }
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function concatenate(parts: Uint8Array[]): Uint8Array {
  const totalLength = parts.reduce((total, part) => total + part.length, 0)
  const output = new Uint8Array(totalLength)
  let offset = 0
  parts.forEach((part) => {
    output.set(part, offset)
    offset += part.length
  })
  return output
}

function localFileHeader(entry: ZipEntryMetadata): Uint8Array {
  assertUint16(entry.name.length, 'ZIP file name length')
  assertUint32(entry.data.length, 'ZIP file size')
  const header = new Uint8Array(30)
  const view = new DataView(header.buffer)
  view.setUint32(0, 0x04034b50, true)
  view.setUint16(4, VERSION_NEEDED, true)
  view.setUint16(6, UTF8_FLAG, true)
  view.setUint16(8, STORE_METHOD, true)
  view.setUint16(10, 0, true)
  view.setUint16(12, 0, true)
  view.setUint32(14, entry.crc, true)
  view.setUint32(18, entry.data.length, true)
  view.setUint32(22, entry.data.length, true)
  view.setUint16(26, entry.name.length, true)
  view.setUint16(28, 0, true)
  return header
}

function centralDirectoryHeader(entry: ZipEntryMetadata): Uint8Array {
  assertUint16(entry.name.length, 'ZIP file name length')
  assertUint32(entry.data.length, 'ZIP file size')
  assertUint32(entry.offset, 'ZIP file offset')
  const header = new Uint8Array(46)
  const view = new DataView(header.buffer)
  view.setUint32(0, 0x02014b50, true)
  view.setUint16(4, VERSION_MADE_BY, true)
  view.setUint16(6, VERSION_NEEDED, true)
  view.setUint16(8, UTF8_FLAG, true)
  view.setUint16(10, STORE_METHOD, true)
  view.setUint16(12, 0, true)
  view.setUint16(14, 0, true)
  view.setUint32(16, entry.crc, true)
  view.setUint32(20, entry.data.length, true)
  view.setUint32(24, entry.data.length, true)
  view.setUint16(28, entry.name.length, true)
  view.setUint16(30, 0, true)
  view.setUint16(32, 0, true)
  view.setUint16(34, 0, true)
  view.setUint16(36, 0, true)
  view.setUint32(38, 0, true)
  view.setUint32(42, entry.offset, true)
  return header
}

/**
 * Creates a standards-compliant, uncompressed ZIP archive entirely in the browser.
 * CSV exports are small enough that storing files avoids adding a compression dependency.
 */
export function createZip(entries: ZipEntry[]): Uint8Array {
  assertUint16(entries.length, 'ZIP entry count')

  const fileNames = new Set<string>()
  const localParts: Uint8Array[] = []
  const centralParts: Uint8Array[] = []
  let localOffset = 0

  entries.forEach((entry) => {
    const name = String(entry.name ?? '').trim()
    if (!name) throw new Error('ZIP entries require a file name')
    if (fileNames.has(name)) throw new Error(`ZIP contains a duplicate file name: ${name}`)
    fileNames.add(name)

    const metadata: ZipEntryMetadata = {
      name: encoder.encode(name),
      data: toBytes(entry.data),
      crc: 0,
      offset: localOffset,
    }
    metadata.crc = crc32(metadata.data)

    const localHeader = localFileHeader(metadata)
    localParts.push(localHeader, metadata.name, metadata.data)
    localOffset += localHeader.length + metadata.name.length + metadata.data.length
    centralParts.push(centralDirectoryHeader(metadata), metadata.name)
  })

  const centralDirectory = concatenate(centralParts)
  assertUint32(localOffset, 'ZIP central directory offset')
  assertUint32(centralDirectory.length, 'ZIP central directory size')

  const endOfCentralDirectory = new Uint8Array(22)
  const endView = new DataView(endOfCentralDirectory.buffer)
  endView.setUint32(0, 0x06054b50, true)
  endView.setUint16(4, 0, true)
  endView.setUint16(6, 0, true)
  endView.setUint16(8, entries.length, true)
  endView.setUint16(10, entries.length, true)
  endView.setUint32(12, centralDirectory.length, true)
  endView.setUint32(16, localOffset, true)
  endView.setUint16(20, 0, true)

  return concatenate([...localParts, centralDirectory, endOfCentralDirectory])
}
