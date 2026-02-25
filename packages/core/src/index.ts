import { cloneDeep } from 'lodash-es'
import { sillyLogger } from './general/loggers.js'
import * as allocations from './allocations/index.js'
import * as results from './results/index.js'
import { CON } from './controllers/index.js'
import type { TeamEntity, AdjudicatorEntity, VenueEntity, SpeakerEntity, InstitutionEntity, StyleConfig, UserDefinedData } from './types/domain.js'
import type {
  RawAdjudicatorResult,
  RawSpeakerResult,
  RawTeamResult,
  CompiledAdjudicatorResult,
  CompiledSpeakerResult,
  CompiledTeamResult,
} from './types/results.js'
import type {
  Draw,
  LegacyDraw,
  LegacySquareTeams,
  NumbersOfAdjudicators,
  AllocationConfig,
} from './types/allocations.js'
import type {
  DrawGetOptions,
  TeamDrawAlgorithmOptions,
  AdjudicatorDrawAlgorithmOptions,
  VenueDrawAlgorithmOptions,
} from './types/options.js'

function convertDraw(draw: Draw): LegacyDraw {
  const newDraw: LegacyDraw = { r: draw.r, allocation: [] }
  for (const square of draw.allocation) {
    const teams = square.teams
    const teamsObj: LegacySquareTeams =
      teams.length === 2
        ? { og: teams[0], oo: teams[1] }
        : { og: teams[0], oo: teams[1], cg: teams[2], co: teams[3] }
    newDraw.allocation.push({
      ...square,
      teams: teamsObj,
    })
  }
  if (draw.user_defined_data !== undefined) {
    newDraw.user_defined_data = draw.user_defined_data
  }
  return newDraw
}

function teamsFromLegacy(teams: LegacySquareTeams): number[] {
  const ordered: number[] = [teams.og, teams.oo]
  if (typeof teams.cg === 'number') ordered.push(teams.cg)
  if (typeof teams.co === 'number') ordered.push(teams.co)
  return ordered
}

function reconvertDraw(draw: LegacyDraw): Draw {
  const newDraw: Draw = { r: draw.r, allocation: [] }
  for (const square of draw.allocation) {
    newDraw.allocation.push({
      ...square,
      teams: teamsFromLegacy(square.teams),
    })
  }
  if (draw.user_defined_data !== undefined) {
    newDraw.user_defined_data = draw.user_defined_data
  }
  return newDraw
}

function range(start: number, end: number): number[] {
  const res: number[] = []
  for (let i = start; i < end; i += 1) res.push(i)
  return res
}

function normalizeInstitutionPriority(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 1
}

type TeamDrawGetOptions =
  | {
      by?: number[]
      simple?: boolean
      force?: boolean
      algorithm?: 'standard'
      algorithm_options?: TeamDrawAlgorithmOptions
    }
  | {
      by?: number[]
      simple?: boolean
      force?: boolean
      algorithm: 'strict'
      algorithm_options?: TeamDrawAlgorithmOptions
    }
  | {
      by?: number[]
      simple?: boolean
      force?: boolean
      algorithm: 'powerpair'
      algorithm_options?: TeamDrawAlgorithmOptions
    }

type AdjudicatorDrawGetOptions =
  | {
      by?: number[]
      simple?: boolean
      force?: boolean
      algorithm?: 'standard'
      algorithm_options?: AdjudicatorDrawAlgorithmOptions
      numbers_of_adjudicators?: NumbersOfAdjudicators
    }
  | {
      by?: number[]
      simple?: boolean
      force?: boolean
      algorithm: 'traditional'
      algorithm_options?: AdjudicatorDrawAlgorithmOptions
      numbers_of_adjudicators?: NumbersOfAdjudicators
    }

type VenueDrawGetOptions = {
  by?: number[]
  simple?: boolean
  force?: boolean
  shuffle?: boolean
}

type DrawPipelineOptions =
  | ({ team_allocation_algorithm?: 'standard' } & DrawGetOptions)
  | ({ team_allocation_algorithm: 'strict' } & DrawGetOptions)
  | ({ team_allocation_algorithm: 'powerpair' } & DrawGetOptions)

export interface TournamentOptions {
  id?: number
  name?: string
  style?: StyleConfig
  user_defined_data?: UserDefinedData
}

type TeamResultsApi = CON['teams']['results'] & {
  organize: (
    rs: number[],
    options?: { simple?: boolean; force?: boolean }
  ) => Promise<CompiledTeamResult[]>
}

type AdjudicatorResultsApi = CON['adjudicators']['results'] & {
  organize: (rs: number[], options?: { force?: boolean }) => Promise<CompiledAdjudicatorResult[]>
}

type SpeakerResultsApi = CON['speakers']['results'] & {
  organize: (rs: number[], options?: { force?: boolean }) => Promise<CompiledSpeakerResult[]>
}

type TeamsApi = Omit<CON['teams'], 'results'> & { results: TeamResultsApi }
type AdjudicatorsApi = Omit<CON['adjudicators'], 'results'> & { results: AdjudicatorResultsApi }
type SpeakersApi = Omit<CON['speakers'], 'results'> & { results: SpeakerResultsApi }

type DrawsApi = CON['draws'] & {
  get: (_for: number, options?: { options?: DrawPipelineOptions }) => Promise<LegacyDraw>
  teams: {
    get: (_for: number, options?: TeamDrawGetOptions) => Promise<LegacyDraw>
  }
  adjudicators: {
    get: (_for: number, draw: LegacyDraw, options?: AdjudicatorDrawGetOptions) => Promise<LegacyDraw>
  }
  venues: {
    get: (_for: number, draw: LegacyDraw, options?: VenueDrawGetOptions) => Promise<LegacyDraw>
  }
}

export class TournamentHandler {
  con: CON
  teams: TeamsApi
  adjudicators: AdjudicatorsApi
  venues: CON['venues']
  speakers: SpeakersApi
  institutions: CON['institutions']
  rounds: CON['rounds']
  draws: DrawsApi
  config: CON['config']
  close: () => void

  constructor(
    dbUrl: string,
    { id = 0, name, style, user_defined_data = {} }: TournamentOptions = {}
  ) {
    this.con = new CON(dbUrl, { id, name, style, user_defined_data })

    this.teams = this.con.teams as unknown as TeamsApi
    this.adjudicators = this.con.adjudicators as unknown as AdjudicatorsApi
    this.venues = this.con.venues
    this.speakers = this.con.speakers as unknown as SpeakersApi
    this.institutions = this.con.institutions
    this.rounds = this.con.rounds
    this.config = this.con.config
    this.draws = { ...this.con.draws } as DrawsApi
    this.close = this.con.close

    this.teams.results.organize = async (rs: number[], { simple = false, force = false } = {}) => {
      sillyLogger(this.teams.results.organize, arguments, 'results')
      const [teams, speakers, rawTeamResults, rawSpeakerResults, config] = await Promise.all([
        this.teams.read(),
        this.speakers.read(),
        this.teams.results.read(),
        this.speakers.results.read(),
        this.config.read(),
      ])

      const teamNum = config.style.team_num
      if (!force) {
        if (!simple) {
          rs.forEach((r) => results.precheck(teams, speakers, r))
          rs.forEach((r) => results.speakers.precheck(rawSpeakerResults, speakers, r))
        }
        rs.forEach((r) => results.teams.precheck(rawTeamResults, teams, r, teamNum))
      }
      if (simple) {
        return results.teams.simple_compile(teams, rawTeamResults, rs, config.style)
      }
      return results.teams.compile(
        teams,
        speakers,
        rawTeamResults,
        rawSpeakerResults,
        rs,
        config.style
      )
    }

    this.adjudicators.results.organize = async (rs: number[], { force = false } = {}) => {
      sillyLogger(this.adjudicators.results.organize, arguments, 'results')
      const [adjudicators, rawAdjResults] = await Promise.all([
        this.adjudicators.read(),
        this.adjudicators.results.read(),
      ])
      if (!force) {
        rs.forEach((r) => results.adjudicators.precheck(rawAdjResults, adjudicators, r))
      }
      return results.adjudicators.compile(adjudicators, rawAdjResults, rs)
    }

    this.speakers.results.organize = async (rs: number[], { force = false } = {}) => {
      sillyLogger(this.speakers.results.organize, arguments, 'results')
      const [speakers, rawSpeakerResults, config] = await Promise.all([
        this.speakers.read(),
        this.speakers.results.read(),
        this.config.read(),
      ])
      if (!force) {
        rs.forEach((r) => results.speakers.precheck(rawSpeakerResults, speakers, r))
      }
      return results.speakers.compile(speakers, rawSpeakerResults, config.style, rs)
    }

    this.draws.get = async (_for: number, { options = {} }: { options?: DrawPipelineOptions } = {}) => {
      sillyLogger(this.draws.get, arguments, 'draws')
      const normalized = cloneDeep(options)
      const teamOptions: TeamDrawGetOptions = {
        algorithm: normalized.team_allocation_algorithm ?? 'standard',
        algorithm_options: normalized.team_allocation_algorithm_options,
      }
      const adjudicatorOptions: AdjudicatorDrawGetOptions = {
        algorithm: normalized.adjudicator_allocation_algorithm ?? 'standard',
        algorithm_options: normalized.adjudicator_allocation_algorithm_options,
        numbers_of_adjudicators: normalized.numbers_of_adjudicators,
      }
      const venueOptions: VenueDrawGetOptions = {
        shuffle: normalized.venue_allocation_algorithm_options?.shuffle,
      }

      const teamDraw = await this.draws.teams.get(_for, teamOptions)
      const adjudicatorDraw = await this.draws.adjudicators.get(_for, teamDraw, adjudicatorOptions)
      return this.draws.venues.get(_for, adjudicatorDraw, venueOptions)
    }

    this.draws.teams = {
      get: async (
        _for: number,
        {
          by,
          simple = false,
          force = false,
          algorithm = 'standard',
          algorithm_options = {},
        }: TeamDrawGetOptions = {}
      ): Promise<LegacyDraw> => {
        sillyLogger(this.draws.teams.get, arguments, 'draws')
        const rs = by ?? range(1, _for)
        const [config, teams, compiledTeamResults, institutions] = await Promise.all([
          this.config.read(),
          this.teams.read(),
          this.teams.results.organize(rs, { simple, force }),
          this.institutions.read(),
        ])
        const institutionPriorityMap = Object.fromEntries(
          institutions.map((institution) => [institution.id, normalizeInstitutionPriority(institution.priority)])
        )
        const configWithInstitutionPriority: AllocationConfig = {
          ...config,
          institution_priority_map: institutionPriorityMap,
        }

        if (!force) {
          allocations.teams.precheck(teams, institutions, config.style, _for)
        }
        const newDraw =
          algorithm === 'strict'
            ? allocations.teams.strict.get(
                _for,
                teams,
                compiledTeamResults,
                configWithInstitutionPriority,
                algorithm_options
              )
            : algorithm === 'powerpair'
              ? allocations.teams.powerpair.get(
                  _for,
                  teams,
                  compiledTeamResults,
                  algorithm_options,
                  configWithInstitutionPriority
                )
              : allocations.teams.standard.get(
                  _for,
                  teams,
                  compiledTeamResults,
                  algorithm_options,
                  configWithInstitutionPriority
                )
        return convertDraw(newDraw)
      },
    }

    this.draws.adjudicators = {
      get: async (
        _for: number,
        draw: LegacyDraw,
        {
          by,
          simple = false,
          force = false,
          algorithm = 'standard',
          algorithm_options = {},
          numbers_of_adjudicators = { chairs: 1, panels: 2, trainees: 0 },
        }: AdjudicatorDrawGetOptions = {}
      ): Promise<LegacyDraw> => {
        sillyLogger(this.draws.adjudicators.get, arguments, 'draws')
        const rs = by ?? range(1, _for)
        const [config, teams, adjudicators, institutions, compiledTeamResults, compiledAdjudicatorResults] =
          await Promise.all([
            this.config.read(),
            this.teams.read(),
            this.adjudicators.read(),
            this.institutions.read(),
            this.teams.results.organize(rs, { force, simple }),
            this.adjudicators.results.organize(rs, { force }),
          ])

        if (!force) {
          allocations.adjudicators.precheck(
            teams,
            adjudicators,
            institutions,
            config.style,
            _for,
            numbers_of_adjudicators
          )
        }
        const normalizedDraw = reconvertDraw(draw)
        const newDraw =
          algorithm === 'traditional'
            ? allocations.adjudicators.traditional.get(
                _for,
                normalizedDraw,
                adjudicators,
                teams,
                compiledTeamResults,
                compiledAdjudicatorResults,
                numbers_of_adjudicators,
                config,
                algorithm_options
              )
            : allocations.adjudicators.standard.get(
                _for,
                normalizedDraw,
                adjudicators,
                teams,
                compiledTeamResults,
                compiledAdjudicatorResults,
                numbers_of_adjudicators,
                config,
                algorithm_options
              )
        return convertDraw(newDraw)
      },
    }

    this.draws.venues = {
      get: async (
        _for: number,
        draw: LegacyDraw,
        {
          by,
          simple = false,
          force = false,
          shuffle = false,
        }: VenueDrawGetOptions = {}
      ): Promise<LegacyDraw> => {
        sillyLogger(this.draws.venues.get, arguments, 'draws')
        const rs = by ?? range(1, _for)
        const [config, teams, venues, compiledTeamResults] = await Promise.all([
          this.config.read(),
          this.teams.read(),
          this.venues.read(),
          this.teams.results.organize(rs, { simple, force }),
        ])

        if (!force) {
          allocations.venues.precheck(teams, venues, config.style, _for)
        }
        const normalizedDraw = reconvertDraw(draw)
        const newDraw = allocations.venues.standard.get(
          _for,
          normalizedDraw,
          venues,
          compiledTeamResults,
          config,
          shuffle
        )
        return convertDraw(newDraw)
      },
    }
  }
}

export * from './allocations/index.js'
export * from './controllers/index.js'
export * from './general/index.js'
export * as results from './results/index.js'

export default {
  TournamentHandler,
  CON,
  allocations,
  results,
}
