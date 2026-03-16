import dotenv from 'dotenv'
import mongoose from 'mongoose'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { StyleModel } from '../models/style.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '../../../..')

dotenv.config({ path: path.join(rootDir, '.env') })
if (process.env.NODE_ENV === 'production') {
  dotenv.config({ path: path.join(rootDir, '.env.production.local'), override: true })
}
if (process.env.NODE_ENV !== 'production' && !process.env.MONGODB_URI) {
  dotenv.config({ path: path.join(rootDir, '.env.development') })
}

const DEFAULT_MONGODB_URI = 'mongodb://admin:password@localhost:27017/utab?authSource=admin'

type ReplyRoleTarget = {
  side: 'gov' | 'opp'
  order: number
  legacyLong: string
  legacyAbbr: string
  nextLong: string
  nextAbbr: string
}

type StyleTarget = {
  id: number
  name: string
  replyRoles: ReplyRoleTarget[]
}

type StyleMigrationResult = {
  styleId: number
  styleName: string
  status: 'updated' | 'already-current' | 'skipped' | 'not-found'
  details: string[]
}

const STYLE_TARGETS: StyleTarget[] = [
  {
    id: 4,
    name: 'PDA3',
    replyRoles: [
      {
        side: 'gov',
        order: 3,
        legacyLong: 'Government Reply',
        legacyAbbr: 'GR',
        nextLong: 'Prime Minister Reply',
        nextAbbr: 'PMR',
      },
      {
        side: 'opp',
        order: 3,
        legacyLong: 'Opposition Reply',
        legacyAbbr: 'OR',
        nextLong: 'Leader of Opposition Reply',
        nextAbbr: 'LOR',
      },
    ],
  },
  {
    id: 5,
    name: 'PDA4',
    replyRoles: [
      {
        side: 'gov',
        order: 4,
        legacyLong: 'Government Reply',
        legacyAbbr: 'GR',
        nextLong: 'Prime Minister Reply',
        nextAbbr: 'PMR',
      },
      {
        side: 'opp',
        order: 4,
        legacyLong: 'Opposition Reply',
        legacyAbbr: 'OR',
        nextLong: 'Leader of Opposition Reply',
        nextAbbr: 'LOR',
      },
    ],
  },
]

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function renameReplyRole(
  roleList: unknown,
  target: ReplyRoleTarget
): {
  nextRoleList: unknown
  changed: boolean
  skippedReason: string | null
} {
  if (!Array.isArray(roleList)) {
    return {
      nextRoleList: roleList,
      changed: false,
      skippedReason: `${target.side}[${target.order}] is missing because roles is not an array`,
    }
  }

  let found = false
  let changed = false
  let skippedReason: string | null = null

  const nextRoleList = roleList.map((entry) => {
    const role = asRecord(entry)
    if (Number(role.order) !== target.order) return entry

    found = true
    const currentLong = String(role.long ?? '')
    const currentAbbr = String(role.abbr ?? '')
    const isLegacy = currentLong === target.legacyLong && currentAbbr === target.legacyAbbr
    const isCurrent = currentLong === target.nextLong && currentAbbr === target.nextAbbr

    if (isCurrent) return entry
    if (!isLegacy) {
      skippedReason = `${target.side}[${target.order}] is customized (${currentLong}/${currentAbbr})`
      return entry
    }

    changed = true
    return {
      ...role,
      long: target.nextLong,
      abbr: target.nextAbbr,
    }
  })

  if (!found) {
    return {
      nextRoleList: roleList,
      changed: false,
      skippedReason: `${target.side}[${target.order}] was not found`,
    }
  }

  return { nextRoleList, changed, skippedReason }
}

async function migrateStyle(target: StyleTarget): Promise<StyleMigrationResult> {
  const style = await StyleModel.findOne({ id: target.id }).lean().exec()
  if (!style) {
    return {
      styleId: target.id,
      styleName: target.name,
      status: 'not-found',
      details: ['style document was not found'],
    }
  }

  const roles = asRecord(style.roles)
  const nextRoles: Record<string, unknown> = { ...roles }
  let changed = false
  let hasSkip = false
  const details: string[] = []

  target.replyRoles.forEach((replyRole) => {
    const result = renameReplyRole(nextRoles[replyRole.side], replyRole)
    nextRoles[replyRole.side] = result.nextRoleList

    if (result.changed) {
      changed = true
      details.push(
        `${replyRole.side}[${replyRole.order}] -> ${replyRole.nextLong} (${replyRole.nextAbbr})`
      )
      return
    }

    if (result.skippedReason) {
      hasSkip = true
      details.push(result.skippedReason)
      return
    }

    details.push(`${replyRole.side}[${replyRole.order}] already uses ${replyRole.nextAbbr}`)
  })

  if (changed) {
    await StyleModel.updateOne({ id: target.id }, { $set: { roles: nextRoles } }).exec()
    return {
      styleId: target.id,
      styleName: String(style.name ?? target.name),
      status: 'updated',
      details,
    }
  }

  if (hasSkip) {
    return {
      styleId: target.id,
      styleName: String(style.name ?? target.name),
      status: 'skipped',
      details,
    }
  }

  return {
    styleId: target.id,
    styleName: String(style.name ?? target.name),
    status: 'already-current',
    details,
  }
}

async function main() {
  const mongoUri = process.env.MONGODB_URI?.trim() || DEFAULT_MONGODB_URI
  await mongoose.connect(mongoUri)

  try {
    const results = await Promise.all(STYLE_TARGETS.map((target) => migrateStyle(target)))
    const summary = results.reduce(
      (acc, result) => {
        acc.scanned += 1
        if (result.status === 'updated') acc.updated += 1
        if (result.status === 'already-current') acc.alreadyCurrent += 1
        if (result.status === 'skipped') acc.skipped += 1
        if (result.status === 'not-found') acc.notFound += 1
        return acc
      },
      { scanned: 0, updated: 0, alreadyCurrent: 0, skipped: 0, notFound: 0 }
    )

    results.forEach((result) => {
      // eslint-disable-next-line no-console
      console.log(`[${result.status}] style ${result.styleId} ${result.styleName}`)
      result.details.forEach((detail) => {
        // eslint-disable-next-line no-console
        console.log(`  - ${detail}`)
      })
    })

    // eslint-disable-next-line no-console
    console.log('summary:', summary)
  } finally {
    await mongoose.disconnect()
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('failed to migrate PDA reply labels', err)
  process.exitCode = 1
})
