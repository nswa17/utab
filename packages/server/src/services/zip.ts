import { Buffer } from 'node:buffer'

export interface ZipFileEntry {
  path: string
  content: string | Uint8Array | Buffer
  modifiedAt?: Date
}

const CRC32_TABLE = buildCrc32Table()

function buildCrc32Table(): Uint32Array {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i += 1) {
    let c = i
    for (let j = 0; j < 8; j += 1) {
      if ((c & 1) !== 0) {
        c = 0xedb88320 ^ (c >>> 1)
      } else {
        c >>>= 1
      }
    }
    table[i] = c >>> 0
  }
  return table
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i += 1) {
    const index = (crc ^ data[i]) & 0xff
    crc = (crc >>> 8) ^ CRC32_TABLE[index]
  }
  return (crc ^ 0xffffffff) >>> 0
}

function toBuffer(content: ZipFileEntry['content']): Buffer {
  if (Buffer.isBuffer(content)) return content
  if (typeof content === 'string') return Buffer.from(content, 'utf8')
  return Buffer.from(content)
}

function toDosDateTime(value: Date): { date: number; time: number } {
  const date = new Date(value)
  const year = Math.min(2107, Math.max(1980, date.getFullYear()))
  const month = date.getMonth() + 1
  const day = date.getDate()
  const hours = date.getHours()
  const minutes = date.getMinutes()
  const seconds = Math.floor(date.getSeconds() / 2)
  return {
    date: ((year - 1980) << 9) | (month << 5) | day,
    time: (hours << 11) | (minutes << 5) | seconds,
  }
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+/, '')
}

export function buildZip(entries: ZipFileEntry[]): Buffer {
  if (entries.length > 0xffff) {
    throw new Error('Too many zip entries')
  }

  const localChunks: Buffer[] = []
  const centralChunks: Buffer[] = []
  let localOffset = 0

  for (const entry of entries) {
    const path = normalizePath(entry.path)
    const fileName = Buffer.from(path, 'utf8')
    const data = toBuffer(entry.content)
    const { date, time } = toDosDateTime(entry.modifiedAt ?? new Date())
    const checksum = crc32(data)

    const localHeader = Buffer.alloc(30)
    localHeader.writeUInt32LE(0x04034b50, 0)
    localHeader.writeUInt16LE(20, 4)
    localHeader.writeUInt16LE(0, 6)
    localHeader.writeUInt16LE(0, 8)
    localHeader.writeUInt16LE(time, 10)
    localHeader.writeUInt16LE(date, 12)
    localHeader.writeUInt32LE(checksum, 14)
    localHeader.writeUInt32LE(data.length, 18)
    localHeader.writeUInt32LE(data.length, 22)
    localHeader.writeUInt16LE(fileName.length, 26)
    localHeader.writeUInt16LE(0, 28)

    localChunks.push(localHeader, fileName, data)

    const centralHeader = Buffer.alloc(46)
    centralHeader.writeUInt32LE(0x02014b50, 0)
    centralHeader.writeUInt16LE(20, 4)
    centralHeader.writeUInt16LE(20, 6)
    centralHeader.writeUInt16LE(0, 8)
    centralHeader.writeUInt16LE(0, 10)
    centralHeader.writeUInt16LE(time, 12)
    centralHeader.writeUInt16LE(date, 14)
    centralHeader.writeUInt32LE(checksum, 16)
    centralHeader.writeUInt32LE(data.length, 20)
    centralHeader.writeUInt32LE(data.length, 24)
    centralHeader.writeUInt16LE(fileName.length, 28)
    centralHeader.writeUInt16LE(0, 30)
    centralHeader.writeUInt16LE(0, 32)
    centralHeader.writeUInt16LE(0, 34)
    centralHeader.writeUInt16LE(0, 36)
    centralHeader.writeUInt32LE(0, 38)
    centralHeader.writeUInt32LE(localOffset, 42)

    centralChunks.push(centralHeader, fileName)
    localOffset += localHeader.length + fileName.length + data.length
  }

  const centralSize = centralChunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const centralOffset = localOffset
  const endOfCentral = Buffer.alloc(22)
  endOfCentral.writeUInt32LE(0x06054b50, 0)
  endOfCentral.writeUInt16LE(0, 4)
  endOfCentral.writeUInt16LE(0, 6)
  endOfCentral.writeUInt16LE(entries.length, 8)
  endOfCentral.writeUInt16LE(entries.length, 10)
  endOfCentral.writeUInt32LE(centralSize, 12)
  endOfCentral.writeUInt32LE(centralOffset, 16)
  endOfCentral.writeUInt16LE(0, 20)

  return Buffer.concat([...localChunks, ...centralChunks, endOfCentral])
}
