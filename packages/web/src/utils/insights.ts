type VolatilityDetail = {
  r?: unknown
  round?: unknown
  ranking?: unknown
}

type VolatilityInput = {
  id: unknown
  ranking?: unknown
  details?: VolatilityDetail[]
}

type VolatilityPoint = {
  round: number
  ranking: number
}

export type VolatilityRow = {
  id: string
  score: number
  variance: number
  maxJump: number
  abrupt: boolean
  trajectory: number[]
  rounds: number[]
}

export type VolatilityOptions = {
  abruptRankJump?: number
  abruptAverageJump?: number
}

type StrictnessInput = {
  id: unknown
  average?: unknown
}

export type JudgeStrictnessRow = {
  id: string
  average: number
  zScore: number
  direction: 'strict' | 'lenient' | 'neutral'
  outlier: boolean
}

export type JudgeStrictnessOptions = {
  outlierZScore?: number
}

type SubmissionSpeedInput = {
  round?: unknown
  createdAt?: unknown
  type?: unknown
  submittedEntityId?: unknown
  payload?: unknown
}

export type SubmissionSpeedRow = {
  round: number
  sampleCount: number
  medianMinutes: number
  p90Minutes: number
  delayedRate: number
  status: 'ok' | 'warn' | 'danger'
}

export type SubmissionSpeedOptions = {
  delayedMinutes?: number
}

export type SubmissionDelayRow = {
  round: number
  id: string
  type: 'ballot' | 'feedback' | 'unknown'
  elapsedMinutes: number
  createdAt: string
}

export type SubmissionDelayOptions = SubmissionSpeedOptions & {
  topPerRound?: number
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function toRounded(value: number): number {
  return Math.round(value * 1000) / 1000
}

function percentile(sorted: number[], ratio: number): number {
  if (sorted.length === 0) return 0
  if (sorted.length === 1) return sorted[0]
  const position = ratio * (sorted.length - 1)
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  if (lower === upper) return sorted[lower]
  const weight = position - lower
  return sorted[lower] * (1 - weight) + sorted[upper] * weight
}

function parseSubmissionRound(value: unknown): number | null {
  const round = toFiniteNumber(value)
  if (round === null) return null
  return round
}

function parseSubmissionTimestamp(value: unknown): number | null {
  const parsed = Date.parse(String(value ?? ''))
  return Number.isFinite(parsed) ? parsed : null
}

function resolveSubmittedEntityId(submission: SubmissionSpeedInput): string {
  const direct = String(submission.submittedEntityId ?? '').trim()
  if (direct.length > 0) return direct
  const payload = submission.payload
  if (!payload || typeof payload !== 'object') return ''
  const nested = String((payload as Record<string, unknown>).submittedEntityId ?? '').trim()
  return nested
}

function resolveSubmissionType(raw: unknown): 'ballot' | 'feedback' | 'unknown' {
  if (raw === 'ballot' || raw === 'feedback') return raw
  return 'unknown'
}

function normalizePoints(row: VolatilityInput): VolatilityPoint[] {
  const map = new Map<number, number>()
  ;(row.details ?? []).forEach((detail) => {
    const round = toFiniteNumber(detail?.r ?? detail?.round)
    const ranking = toFiniteNumber(detail?.ranking)
    if (round === null || ranking === null) return
    map.set(round, ranking)
  })
  if (map.size > 0) {
    return Array.from(map.entries())
      .sort((left, right) => left[0] - right[0])
      .map(([round, ranking]) => ({ round, ranking }))
  }
  const ranking = toFiniteNumber(row.ranking)
  if (ranking === null) return []
  return [{ round: 0, ranking }]
}

function summarizeJumps(points: VolatilityPoint[]) {
  if (points.length < 2) {
    return {
      averageJump: 0,
      variance: 0,
      maxJump: 0,
    }
  }
  const jumps: number[] = []
  for (let index = 1; index < points.length; index += 1) {
    jumps.push(Math.abs(points[index].ranking - points[index - 1].ranking))
  }
  const averageJump = jumps.reduce((acc, jump) => acc + jump, 0) / jumps.length
  const variance =
    jumps.reduce((acc, jump) => acc + (jump - averageJump) * (jump - averageJump), 0) /
    jumps.length
  const maxJump = Math.max(...jumps)
  return {
    averageJump,
    variance,
    maxJump,
  }
}

export function buildVolatilityRows(
  rows: VolatilityInput[],
  options: VolatilityOptions = {}
): VolatilityRow[] {
  const abruptRankJump = options.abruptRankJump ?? 3
  const abruptAverageJump = options.abruptAverageJump ?? 1.5
  return rows
    .map((row) => {
      const points = normalizePoints(row)
      const summary = summarizeJumps(points)
      const score = toRounded(summary.averageJump)
      const variance = toRounded(summary.variance)
      const maxJump = toRounded(summary.maxJump)
      return {
        id: String(row.id ?? ''),
        score,
        variance,
        maxJump,
        abrupt: maxJump >= abruptRankJump || score >= abruptAverageJump,
        trajectory: points.map((point) => point.ranking),
        rounds: points.map((point) => point.round),
      }
    })
    .filter((row) => row.id.length > 0)
    .sort((left, right) => {
      if (left.score !== right.score) return right.score - left.score
      if (left.maxJump !== right.maxJump) return right.maxJump - left.maxJump
      return left.id.localeCompare(right.id, 'en')
    })
}

export function formatVolatilityTrajectory(trajectory: number[]): string {
  if (!Array.isArray(trajectory) || trajectory.length === 0) return '—'
  return trajectory.map((value) => String(value)).join('→')
}

export function buildJudgeStrictnessRows(
  rows: StrictnessInput[],
  options: JudgeStrictnessOptions = {}
): JudgeStrictnessRow[] {
  const outlierZScore = options.outlierZScore ?? 1
  const normalized = rows
    .map((row) => {
      const id = String(row.id ?? '')
      const average = toFiniteNumber(row.average)
      return { id, average }
    })
    .filter((row) => row.id.length > 0 && row.average !== null) as Array<{ id: string; average: number }>
  if (normalized.length === 0) return []
  const mean = normalized.reduce((acc, row) => acc + row.average, 0) / normalized.length
  const variance =
    normalized.reduce((acc, row) => acc + (row.average - mean) * (row.average - mean), 0) /
    normalized.length
  const deviation = Math.sqrt(variance)
  return normalized
    .map((row) => {
      const zScore = deviation === 0 ? 0 : (row.average - mean) / deviation
      const rounded = toRounded(zScore)
      const absScore = Math.abs(rounded)
      const outlier = absScore >= outlierZScore
      const direction: 'strict' | 'lenient' | 'neutral' =
        rounded <= -outlierZScore ? 'strict' : rounded >= outlierZScore ? 'lenient' : 'neutral'
      return {
        id: row.id,
        average: toRounded(row.average),
        zScore: rounded,
        direction,
        outlier,
      }
    })
    .sort((left, right) => Math.abs(right.zScore) - Math.abs(left.zScore))
}

export function buildSubmissionSpeedRows(
  submissions: SubmissionSpeedInput[],
  options: SubmissionSpeedOptions = {}
): SubmissionSpeedRow[] {
  const delayedMinutes = options.delayedMinutes ?? 30
  const byRound = new Map<number, number[]>()
  submissions.forEach((submission) => {
    const round = parseSubmissionRound(submission.round)
    if (round === null) return
    const parsed = parseSubmissionTimestamp(submission.createdAt)
    if (parsed === null) return
    const list = byRound.get(round) ?? []
    list.push(parsed)
    byRound.set(round, list)
  })
  return Array.from(byRound.entries())
    .sort((left, right) => left[0] - right[0])
    .map(([round, timestamps]) => {
      if (timestamps.length === 0) {
        return {
          round,
          sampleCount: 0,
          medianMinutes: 0,
          p90Minutes: 0,
          delayedRate: 0,
          status: 'ok' as const,
        }
      }
      const start = Math.min(...timestamps)
      const elapsed = timestamps
        .map((value) => (value - start) / 60000)
        .filter((value) => Number.isFinite(value) && value >= 0)
        .sort((a, b) => a - b)
      if (elapsed.length === 0) {
        return {
          round,
          sampleCount: 0,
          medianMinutes: 0,
          p90Minutes: 0,
          delayedRate: 0,
          status: 'ok' as const,
        }
      }
      const medianMinutes = toRounded(percentile(elapsed, 0.5))
      const p90Minutes = toRounded(percentile(elapsed, 0.9))
      const delayedRate = toRounded(elapsed.filter((value) => value > delayedMinutes).length / elapsed.length)
      let status: 'ok' | 'warn' | 'danger' = 'ok'
      if (p90Minutes > delayedMinutes * 1.5 || delayedRate >= 0.4) status = 'danger'
      else if (p90Minutes > delayedMinutes || delayedRate >= 0.2) status = 'warn'
      return {
        round,
        sampleCount: elapsed.length,
        medianMinutes,
        p90Minutes,
        delayedRate,
        status,
      }
    })
}

export function buildSubmissionDelayRows(
  submissions: SubmissionSpeedInput[],
  options: SubmissionDelayOptions = {}
): SubmissionDelayRow[] {
  const delayedMinutes = options.delayedMinutes ?? 30
  const topPerRound = Math.max(1, Math.floor(options.topPerRound ?? 3))
  const byRound = new Map<
    number,
    Array<{ timestamp: number; type: 'ballot' | 'feedback' | 'unknown'; id: string }>
  >()
  submissions.forEach((submission) => {
    const round = parseSubmissionRound(submission.round)
    if (round === null) return
    const timestamp = parseSubmissionTimestamp(submission.createdAt)
    if (timestamp === null) return
    const list = byRound.get(round) ?? []
    list.push({
      timestamp,
      type: resolveSubmissionType(submission.type),
      id: resolveSubmittedEntityId(submission),
    })
    byRound.set(round, list)
  })
  const rows: SubmissionDelayRow[] = []
  Array.from(byRound.entries())
    .sort((left, right) => left[0] - right[0])
    .forEach(([round, list]) => {
      if (list.length === 0) return
      const start = Math.min(...list.map((item) => item.timestamp))
      list
        .map((item) => ({
          ...item,
          elapsedMinutes: toRounded((item.timestamp - start) / 60000),
        }))
        .filter((item) => item.elapsedMinutes > delayedMinutes)
        .sort((left, right) => right.elapsedMinutes - left.elapsedMinutes)
        .slice(0, topPerRound)
        .forEach((item) => {
          rows.push({
            round,
            id: item.id,
            type: item.type,
            elapsedMinutes: item.elapsedMinutes,
            createdAt: new Date(item.timestamp).toISOString(),
          })
        })
    })
  return rows
}
