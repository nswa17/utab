import { DBHandler, DBOptions } from './handlers.js'

function bind<T extends (...args: any[]) => any>(fn: T, ctx: any): T {
  return fn.bind(ctx) as T
}

export class CON {
  dbh: DBHandler
  draws: any
  rounds: any
  config: any
  teams: any
  adjudicators: any
  venues: any
  speakers: any
  institutions: any
  close: () => void

  constructor(dbUrl: string, options: DBOptions) {
    this.dbh = new DBHandler(dbUrl, options)

    const con = this
    this.draws = {
      read: bind(con.dbh.draws.read, con.dbh.draws),
      create: bind(con.dbh.draws.create, con.dbh.draws),
      delete: bind(con.dbh.draws.delete, con.dbh.draws),
      find: bind(con.dbh.draws.find, con.dbh.draws),
      update: bind(con.dbh.draws.update, con.dbh.draws),
    }

    this.rounds = {
      read: bind(con.dbh.rounds.read, con.dbh.rounds),
      create: bind(con.dbh.rounds.create, con.dbh.rounds),
      delete: bind(con.dbh.rounds.delete, con.dbh.rounds),
      find: bind(con.dbh.rounds.find, con.dbh.rounds),
      update: bind(con.dbh.rounds.update, con.dbh.rounds),
      findOne: bind(con.dbh.rounds.findOne, con.dbh.rounds),
    }

    this.config = {
      read: bind(con.dbh.config.read, con.dbh.config),
      update: bind(con.dbh.config.update, con.dbh.config),
    }

    this.teams = {
      read: bind(con.dbh.teams.read, con.dbh.teams),
      create: bind(con.dbh.teams.create, con.dbh.teams),
      delete: bind(con.dbh.teams.delete, con.dbh.teams),
      deleteAll: bind(con.dbh.teams.deleteAll, con.dbh.teams),
      find: bind(con.dbh.teams.find, con.dbh.teams),
      findOne: bind(con.dbh.teams.findOne, con.dbh.teams),
      update: bind(con.dbh.teams.update, con.dbh.teams),
      results: {
        read: bind(con.dbh.raw_team_results.read, con.dbh.raw_team_results),
        create: bind(con.dbh.raw_team_results.create, con.dbh.raw_team_results),
        update: bind(con.dbh.raw_team_results.update, con.dbh.raw_team_results),
        delete: bind(con.dbh.raw_team_results.delete, con.dbh.raw_team_results),
        deleteAll: bind(con.dbh.raw_team_results.deleteAll, con.dbh.raw_team_results),
        find: bind(con.dbh.raw_team_results.find, con.dbh.raw_team_results),
        findOne: bind(con.dbh.raw_team_results.findOne, con.dbh.raw_team_results),
      },
    }

    this.adjudicators = {
      read: bind(con.dbh.adjudicators.read, con.dbh.adjudicators),
      create: bind(con.dbh.adjudicators.create, con.dbh.adjudicators),
      delete: bind(con.dbh.adjudicators.delete, con.dbh.adjudicators),
      deleteAll: bind(con.dbh.adjudicators.deleteAll, con.dbh.adjudicators),
      update: bind(con.dbh.adjudicators.update, con.dbh.adjudicators),
      find: bind(con.dbh.adjudicators.find, con.dbh.adjudicators),
      findOne: bind(con.dbh.adjudicators.findOne, con.dbh.adjudicators),
      results: {
        read: bind(con.dbh.raw_adjudicator_results.read, con.dbh.raw_adjudicator_results),
        create: bind(con.dbh.raw_adjudicator_results.create, con.dbh.raw_adjudicator_results),
        update: bind(con.dbh.raw_adjudicator_results.update, con.dbh.raw_adjudicator_results),
        delete: bind(con.dbh.raw_adjudicator_results.delete, con.dbh.raw_adjudicator_results),
        deleteAll: bind(con.dbh.raw_adjudicator_results.deleteAll, con.dbh.raw_adjudicator_results),
        find: bind(con.dbh.raw_adjudicator_results.find, con.dbh.raw_adjudicator_results),
        findOne: bind(con.dbh.raw_adjudicator_results.findOne, con.dbh.raw_adjudicator_results),
      },
    }

    this.venues = {
      read: bind(con.dbh.venues.read, con.dbh.venues),
      create: bind(con.dbh.venues.create, con.dbh.venues),
      delete: bind(con.dbh.venues.delete, con.dbh.venues),
      deleteAll: bind(con.dbh.venues.deleteAll, con.dbh.venues),
      find: bind(con.dbh.venues.find, con.dbh.venues),
      findOne: bind(con.dbh.venues.findOne, con.dbh.venues),
      update: bind(con.dbh.venues.update, con.dbh.venues),
    }

    this.speakers = {
      read: bind(con.dbh.speakers.read, con.dbh.speakers),
      create: bind(con.dbh.speakers.create, con.dbh.speakers),
      delete: bind(con.dbh.speakers.delete, con.dbh.speakers),
      deleteAll: bind(con.dbh.speakers.deleteAll, con.dbh.speakers),
      update: bind(con.dbh.speakers.update, con.dbh.speakers),
      find: bind(con.dbh.speakers.find, con.dbh.speakers),
      findOne: bind(con.dbh.speakers.findOne, con.dbh.speakers),
      results: {
        read: bind(con.dbh.raw_speaker_results.read, con.dbh.raw_speaker_results),
        create: bind(con.dbh.raw_speaker_results.create, con.dbh.raw_speaker_results),
        update: bind(con.dbh.raw_speaker_results.update, con.dbh.raw_speaker_results),
        delete: bind(con.dbh.raw_speaker_results.delete, con.dbh.raw_speaker_results),
        deleteAll: bind(con.dbh.raw_speaker_results.deleteAll, con.dbh.raw_speaker_results),
        find: bind(con.dbh.raw_speaker_results.find, con.dbh.raw_speaker_results),
        findOne: bind(con.dbh.raw_speaker_results.findOne, con.dbh.raw_speaker_results),
      },
    }

    this.institutions = {
      read: bind(con.dbh.institutions.read, con.dbh.institutions),
      create: bind(con.dbh.institutions.create, con.dbh.institutions),
      delete: bind(con.dbh.institutions.delete, con.dbh.institutions),
      deleteAll: bind(con.dbh.institutions.deleteAll, con.dbh.institutions),
      find: bind(con.dbh.institutions.find, con.dbh.institutions),
      findOne: bind(con.dbh.institutions.findOne, con.dbh.institutions),
      update: bind(con.dbh.institutions.update, con.dbh.institutions),
    }

    this.close = bind(con.dbh.close, con.dbh)
  }
}

export default CON
