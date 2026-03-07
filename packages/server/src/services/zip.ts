import { Buffer } from 'node:buffer'
import { inflateRawSync } from 'node:zlib'

export interface ZipFileEntry {
  path: string
  content: string | Uint8Array | Buffer
  modifiedAt?: Date
}

export interface ExtractedZipEntry {
  path: string
  content: Buffer
}

const CRC32_TABLE = buildCrc32Table()
const ZIP_LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50
const ZIP_CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50
const ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50
const ZIP_UTF8_FLAG = 0x0800
const ZIP_ENCRYPTED_FLAG = 0x0001
const ZIP_METHOD_STORE = 0
const ZIP_METHOD_DEFLATE = 8

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

function decodeZipString(buffer: Buffer, offset: number, length: number, flags: number): string {
  const encoding = (flags & ZIP_UTF8_FLAG) !== 0 ? 'utf8' : 'utf8'
  return normalizePath(buffer.toString(encoding, offset, offset + length))
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  const minOffset = Math.max(0, buffer.length - 0xffff - 22)
  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE) {
      return offset
    }
  }
  throw new Error('Invalid zip archive: end of central directory not found')
}

export function extractZip(buffer: Buffer): ExtractedZipEntry[] {
  if (buffer.length < 22) {
    throw new Error('Invalid zip archive: file is too small')
  }

  const eocdOffset = findEndOfCentralDirectory(buffer)
  const entryCount = buffer.readUInt16LE(eocdOffset + 10)
  const centralDirectorySize = buffer.readUInt32LE(eocdOffset + 12)
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16)
  const centralDirectoryEnd = centralDirectoryOffset + centralDirectorySize

  if (centralDirectoryEnd > buffer.length) {
    throw new Error('Invalid zip archive: central directory exceeds file size')
  }

  const entries: ExtractedZipEntry[] = []
  let offset = centralDirectoryOffset

  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > buffer.length) {
      throw new Error('Invalid zip archive: truncated central directory header')
    }
    if (buffer.readUInt32LE(offset) !== ZIP_CENTRAL_DIRECTORY_SIGNATURE) {
      throw new Error('Invalid zip archive: invalid central directory header')
    }

    const flags = buffer.readUInt16LE(offset + 8)
    if ((flags & ZIP_ENCRYPTED_FLAG) !== 0) {
      throw new Error('Unsupported zip archive: encrypted entries are not supported')
    }

    const compressionMethod = buffer.readUInt16LE(offset + 10)
    const compressedSize = buffer.readUInt32LE(offset + 20)
    const uncompressedSize = buffer.readUInt32LE(offset + 24)
    const fileNameLength = buffer.readUInt16LE(offset + 28)
    const extraFieldLength = buffer.readUInt16LE(offset + 30)
    const fileCommentLength = buffer.readUInt16LE(offset + 32)
    const localHeaderOffset = buffer.readUInt32LE(offset + 42)
    const path = decodeZipString(buffer, offset + 46, fileNameLength, flags)

    offset += 46 + fileNameLength + extraFieldLength + fileCommentLength

    if (!path || path.endsWith('/')) {
      continue
    }

    if (localHeaderOffset + 30 > buffer.length) {
      throw new Error(`Invalid zip archive: truncated local file header for ${path}`)
    }
    if (buffer.readUInt32LE(localHeaderOffset) !== ZIP_LOCAL_FILE_HEADER_SIGNATURE) {
      throw new Error(`Invalid zip archive: invalid local file header for ${path}`)
    }

    const localFileNameLength = buffer.readUInt16LE(localHeaderOffset + 26)
    const localExtraFieldLength = buffer.readUInt16LE(localHeaderOffset + 28)
    const dataOffset = localHeaderOffset + 30 + localFileNameLength + localExtraFieldLength
    const compressedEnd = dataOffset + compressedSize
    if (compressedEnd > buffer.length) {
      throw new Error(`Invalid zip archive: truncated file data for ${path}`)
    }

    const compressed = buffer.subarray(dataOffset, compressedEnd)
    let content: Buffer
    if (compressionMethod === ZIP_METHOD_STORE) {
      content = Buffer.from(compressed)
    } else if (compressionMethod === ZIP_METHOD_DEFLATE) {
      content = inflateRawSync(compressed)
    } else {
      throw new Error(`Unsupported zip compression method for ${path}`)
    }

    if (content.length !== uncompressedSize) {
      throw new Error(`Invalid zip archive: size mismatch for ${path}`)
    }

    entries.push({ path, content })
  }

  return entries
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
