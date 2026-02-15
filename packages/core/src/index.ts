import { cloneDeep } from 'lodash-es'
import { sillyLogger } from './general/loggers.js'
import * as allocations from './allocations/index.js'
import * as results from './results/index.js'
import { CON } from './controllers/index.js'

function values<T>(obj: Record<string, T>): T[] {
  return Object.keys(obj).map((key) => obj[key])
}

function convertDraw(draw: any) {
  const newDraw = { r: draw.r, allocation: [] as any[] }
  for (const square of draw.allocation) {
    const newSquare: any = { ...square }
    const teams = square.teams as number[]
    delete newSquare.teams
    if (teams.length === 2) {
      newSquare.teams = { og: teams[0], oo: teams[1] }
    } else {
      newSquare.teams = { og: teams[0], oo: teams[1], cg: teams[2], co: teams[3] }
    }
    newDraw.allocation.push(newSquare)
  }
  return newDraw
}

function reconvertDraw(draw: any) {
  const newDraw = { r: draw.r, allocation: [] as any[] }
  for (const square of draw.allocation) {
    const newSquare: any = { ...square }
    newSquare.teams = values(square.teams)
    newDraw.allocation.push(newSquare)
  }
  return newDraw
}

function range(start: number, end: number): number[] {
  const res: number[] = []
  for (let i = start; i < end; i++) res.push(i)
  return res
}

export interface TournamentOptions {
  id?: number
  name?: string
  style?: any
  user_defined_data?: any
}

export class TournamentHandler {
  con: CON
  teams: any
  adjudicators: any
  venues: any
  speakers: any
  institutions: any
  rounds: any
  draws: any
  config: any
  close: () => void

  constructor(
    dbUrl: string,
    { id = 0, name, style, user_defined_data = {} }: TournamentOptions = {}
  ) {
    this.con = new CON(dbUrl, { id, name, style, user_defined_data })

    this.teams = this.con.teams
    this.adjudicators = this.con.adjudicators
    this.venues = this.con.venues
    this.speakers = this.con.speakers
    this.institutions = this.con.institutions
    this.rounds = this.con.rounds
    this.config = this.con.config
    this.draws = { ...this.con.draws }
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

    this.draws.get = async (_for: number, { options = {} }: { options?: any } = {}) => {
      sillyLogger(this.draws.get, arguments, 'draws')
      const optionsForTeamAllocation = cloneDeep(options)
      const optionsForAdjudicatorAllocation = cloneDeep(options)
      const optionsForVenueAllocation = cloneDeep(options)

      if (Object.prototype.hasOwnProperty.call(options, 'team_allocation_algorithm')) {
        optionsForTeamAllocation.algorithm = options.team_allocation_algorithm
      }
      if (Object.prototype.hasOwnProperty.call(options, 'team_allocation_algorithm_options')) {
        optionsForTeamAllocation.algorithm_options = options.team_allocation_algorithm_options
      }
      if (Object.prototype.hasOwnProperty.call(options, 'adjudicator_allocation_algorithm')) {
        optionsForAdjudicatorAllocation.algorithm = options.adjudicator_allocation_algorithm
      }
      if (
        Object.prototype.hasOwnProperty.call(options, 'adjudicator_allocation_algorithm_options')
      ) {
        optionsForAdjudicatorAllocation.algorithm_options =
          options.adjudicator_allocation_algorithm_options
      }
      if (Object.prototype.hasOwnProperty.call(options, 'venue_allocation_algorithm_options')) {
        optionsForVenueAllocation.algorithm_options = options.venue_allocation_algorithm_options
      }

      const teamDraw = await this.draws.teams.get(_for, optionsForTeamAllocation)
      const adjudicatorDraw = await this.draws.adjudicators.get(
        _for,
        reconvertDraw(teamDraw),
        optionsForAdjudicatorAllocation
      )
      return this.draws.venues.get(_for, reconvertDraw(adjudicatorDraw), optionsForVenueAllocation)
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
        }: {
          by?: number[]
          simple?: boolean
          force?: boolean
          algorithm?: string
          algorithm_options?: any
        } = {}
      ) => {
        sillyLogger(this.draws.teams.get, arguments, 'draws')
        const rs = by ?? range(1, _for)
        const [config, teams, compiledTeamResults, institutions] = await Promise.all([
          this.config.read(),
          this.teams.read(),
          this.teams.results.organize(rs, { simple, force }),
          this.institutions.read(),
        ])
        const institutionPriorityMap = Object.fromEntries(
          (institutions as Array<{ id: number; priority?: unknown }>).map((institution) => {
            const parsed = Number(institution.priority)
            return [institution.id, Number.isFinite(parsed) && parsed >= 0 ? parsed : 1]
          })
        )
        const configWithInstitutionPriority = {
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
        draw: any,
        {
          by,
          simple = false,
          force = false,
          algorithm = 'standard',
          algorithm_options = {},
          numbers_of_adjudicators = { chairs: 1, panels: 2, trainees: 0 },
        }: {
          by?: number[]
          simple?: boolean
          force?: boolean
          algorithm?: string
          algorithm_options?: any
          numbers_of_adjudicators?: { chairs: number; panels: number; trainees: number }
        } = {}
      ) => {
        sillyLogger(this.draws.adjudicators.get, arguments, 'draws')
        const rs = by ?? range(1, _for)
        const [
          config,
          teams,
          adjudicators,
          institutions,
          compiledTeamResults,
          compiledAdjudicatorResults,
        ] = await Promise.all([
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
        const newDraw =
          algorithm === 'traditional'
            ? allocations.adjudicators.traditional.get(
                _for,
                draw,
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
                draw,
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
        draw: any,
        {
          by,
          simple = false,
          force = false,
          shuffle = false,
        }: { by?: number[]; simple?: boolean; force?: boolean; shuffle?: boolean } = {}
      ) => {
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
        const newDraw = allocations.venues.standard.get(
          _for,
          draw,
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
