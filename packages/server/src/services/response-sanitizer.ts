type PlainRecord = Record<string, unknown>

const COMMON_BLOCKED_KEYS = new Set([
  'createdBy',
  'submittedBy',
  'userDefinedData',
  'user_defined_data',
  'passwordHash',
  'tournaments',
])

const RESULT_BLOCKED_KEYS = new Set([...COMMON_BLOCKED_KEYS, 'comment'])

function asRecord(value: unknown): PlainRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  return value as PlainRecord
}

function hasOwn(source: PlainRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(source, key)
}

function pick(source: PlainRecord, keys: string[]): PlainRecord {
  const out: PlainRecord = {}
  keys.forEach((key) => {
    if (hasOwn(source, key)) {
      out[key] = source[key]
    }
  })
  return out
}

function sanitizeDeep(value: unknown, blockedKeys: Set<string>): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeDeep(item, blockedKeys))
  }
  if (!value || typeof value !== 'object') {
    return value
  }
  const record = value as PlainRecord
  const out: PlainRecord = {}
  Object.entries(record).forEach(([key, child]) => {
    if (blockedKeys.has(key)) return
    out[key] = sanitizeDeep(child, blockedKeys)
  })
  return out
}

function sanitizeDrawAllocation(
  allocationValue: unknown,
  drawOpened: boolean,
  allocationOpened: boolean
): unknown[] {
  if (!drawOpened || !Array.isArray(allocationValue)) return []

  return allocationValue.map((rowValue) => {
    const row = asRecord(rowValue)
    return {
      ...(hasOwn(row, 'venue') ? { venue: row.venue } : {}),
      ...(hasOwn(row, 'teams') ? { teams: row.teams } : {}),
      chairs: allocationOpened && Array.isArray(row.chairs) ? row.chairs : [],
      panels: allocationOpened && Array.isArray(row.panels) ? row.panels : [],
      trainees: allocationOpened && Array.isArray(row.trainees) ? row.trainees : [],
    }
  })
}

export function sanitizeTeamForPublic(team: unknown): PlainRecord {
  const source = asRecord(team)
  return pick(source, ['_id', 'tournamentId', 'name', 'institution', 'speakers'])
}

export function sanitizeSpeakerForPublic(speaker: unknown): PlainRecord {
  const source = asRecord(speaker)
  return pick(source, ['_id', 'tournamentId', 'name'])
}

export function sanitizeAdjudicatorForPublic(adjudicator: unknown): PlainRecord {
  const source = asRecord(adjudicator)
  return pick(source, ['_id', 'tournamentId', 'name'])
}

export function sanitizeVenueForPublic(venue: unknown): PlainRecord {
  const source = asRecord(venue)
  return pick(source, ['_id', 'tournamentId', 'name'])
}

export function sanitizeInstitutionForPublic(institution: unknown): PlainRecord {
  const source = asRecord(institution)
  return pick(source, ['_id', 'tournamentId', 'name'])
}

export function sanitizeRoundForPublic(round: unknown): PlainRecord {
  const source = asRecord(round)
  const userDefinedData = asRecord(source.userDefinedData)
  const motionOpened = source.motionOpened === true
  const motions = motionOpened && Array.isArray(source.motions) ? source.motions : []
  return {
    ...pick(source, ['_id', 'tournamentId', 'round', 'name']),
    motions,
    motionOpened,
    teamAllocationOpened: source.teamAllocationOpened !== false,
    adjudicatorAllocationOpened: source.adjudicatorAllocationOpened !== false,
    userDefinedData: {
      hidden: userDefinedData.hidden === true,
      evaluate_from_adjudicators: userDefinedData.evaluate_from_adjudicators !== false,
      evaluate_from_teams: userDefinedData.evaluate_from_teams !== false,
      chairs_always_evaluated: userDefinedData.chairs_always_evaluated === true,
      no_speaker_score: userDefinedData.no_speaker_score === true,
      allow_low_tie_win: userDefinedData.allow_low_tie_win !== false,
      score_by_matter_manner: userDefinedData.score_by_matter_manner !== false,
      poi: userDefinedData.poi !== false,
      best: userDefinedData.best !== false,
      evaluator_in_team: userDefinedData.evaluator_in_team === 'speaker' ? 'speaker' : 'team',
    },
  }
}

export function sanitizeDrawForPublic(draw: unknown): PlainRecord {
  const source = asRecord(draw)
  const drawOpened = source.drawOpened === true
  const allocationOpened = source.allocationOpened === true
  return {
    ...pick(source, ['_id', 'tournamentId', 'round']),
    drawOpened,
    allocationOpened,
    allocation: sanitizeDrawAllocation(source.allocation, drawOpened, allocationOpened),
  }
}

export function sanitizeResultForPublic(result: unknown): PlainRecord {
  const source = asRecord(result)
  return {
    ...pick(source, ['_id', 'tournamentId', 'round']),
    payload: sanitizeDeep(source.payload, RESULT_BLOCKED_KEYS),
  }
}

export function sanitizeCompiledForPublic(compiled: unknown): PlainRecord {
  const source = asRecord(compiled)
  const payload = asRecord(source.payload)
  return {
    ...pick(source, ['_id', 'tournamentId']),
    payload: sanitizeDeep(payload, RESULT_BLOCKED_KEYS),
  }
}

export function sanitizeCompiledSubsetForPublic(subset: unknown): PlainRecord {
  const source = asRecord(subset)
  return {
    ...pick(source, ['compiledId', 'tournamentId', 'rounds']),
    results: sanitizeDeep(source.results, RESULT_BLOCKED_KEYS),
  }
}

export function sanitizeAggregateForPublic(value: unknown): unknown {
  return sanitizeDeep(value, RESULT_BLOCKED_KEYS)
}

export function sanitizeTournamentForPublic(tournament: unknown): PlainRecord {
  const source = asRecord(tournament)
  const access = asRecord(asRecord(source.auth).access)
  const userDefinedData = asRecord(source.user_defined_data)
  return {
    ...pick(source, ['_id', 'name', 'style', 'total_round_num', 'current_round_num']),
    hidden: userDefinedData.hidden === true,
    auth: {
      access: {
        required: access.required === true,
      },
    },
  }
}
