import mongoose, { Model } from 'mongoose'
import { cloneDeep } from 'lodash-es'
import { sillyLogger } from '../general/loggers.js'
import * as errors from '../general/errors.js'
import { createSchemas, CreatedModels } from './schemas.js'
import type {
  AdjudicatorEntity,
  InstitutionEntity,
  SpeakerEntity,
  StyleConfig,
  TeamEntity,
  UserDefinedData,
  VenueEntity,
} from '../types/domain.js'
import type { RawAdjudicatorResult, RawSpeakerResult, RawTeamResult } from '../types/results.js'

mongoose.Promise = global.Promise

type PlainRecord = Record<string, unknown>

type RoundRecord = {
  r: number
  round_name?: string
  team_allocation_opened?: boolean
  adjudicator_allocation_opened?: boolean
  motions?: string[]
  weights_of_adjudicators?: {
    chair: number
    panel: number
    trainee: number
  }
  user_defined_data?: UserDefinedData
}

type DrawRecord = {
  r: number
  allocation: unknown
  user_defined_data?: UserDefinedData
}

type ConfigRecord = {
  id: number
  db_url: string
  name: string
  style: StyleConfig
  preev_weights?: number[]
  current_round_num?: number
  total_round_num?: number
  user_defined_data?: UserDefinedData
}

function arrangeDoc<T extends object>(doc: unknown): T {
  const newDoc = JSON.parse(JSON.stringify(doc)) as PlainRecord
  delete newDoc._id
  if (Array.isArray(newDoc.details)) {
    newDoc.details.forEach((detail) => {
      if (detail && typeof detail === 'object') {
        delete (detail as PlainRecord)._id
      }
    })
  }
  return newDoc as T
}

function pick(identityKeys: string[], dict: PlainRecord): PlainRecord {
  const res: PlainRecord = {}
  identityKeys.forEach((k) => {
    res[k] = dict[k]
  })
  return res
}

class CollectionHandler<T extends object, TRead = T[]> {
  constructor(
    protected model: Model<unknown>,
    private identifiers: string[],
    private readTransform: (docs: T[]) => TRead = (docs) => docs as unknown as TRead
  ) {}

  async read(): Promise<TRead> {
    sillyLogger(this.read, arguments, 'controllers')
    const docs = await this.model.find().exec()
    const arranged = docs.map((doc) => arrangeDoc<T>(doc))
    return this.readTransform(arranged)
  }

  async find(dict: PlainRecord): Promise<T[]> {
    sillyLogger(this.find, arguments, 'controllers')
    const docs = await this.model.find(dict).exec()
    return docs.map((doc) => arrangeDoc<T>(doc))
  }

  async create(dict: PlainRecord): Promise<T> {
    sillyLogger(this.create, arguments, 'controllers')
    const model = new this.model(dict)
    const saved = await model.save()
    return arrangeDoc<T>(saved)
  }

  async update(dict: PlainRecord): Promise<T> {
    sillyLogger(this.update, arguments, 'controllers')
    const identity = pick(this.identifiers, dict)
    const doc = await this.model
      .findOneAndUpdate(identity, { $set: dict, $inc: { version: 1 } }, { new: true })
      .exec()
    if (!doc) throw new errors.DoesNotExist(identity)
    return arrangeDoc<T>(doc)
  }

  async delete(dict: PlainRecord): Promise<T> {
    sillyLogger(this.delete, arguments, 'controllers')
    const identity = pick(this.identifiers, dict)
    const doc = await this.model.findOneAndDelete(identity).exec()
    if (!doc) throw new errors.DoesNotExist(identity)
    return arrangeDoc<T>(doc)
  }

  async deleteAll(): Promise<PlainRecord> {
    sillyLogger(this.deleteAll, arguments, 'controllers')
    const doc = await this.model.deleteMany({}).exec()
    return arrangeDoc<PlainRecord>(doc)
  }

  async findOne(dict: PlainRecord): Promise<T> {
    sillyLogger(this.findOne, arguments, 'controllers')
    const identity = pick(this.identifiers, dict)
    const doc = await this.model.findOne(identity).exec()
    if (!doc) throw new errors.DoesNotExist(identity)
    return arrangeDoc<T>(doc)
  }
}

class EntityCollectionHandler<T extends { id: number }> extends CollectionHandler<T> {
  constructor(model: Model<unknown>) {
    super(model, ['id'])
  }

  override async create(dict: PlainRecord): Promise<T> {
    sillyLogger(this.create, arguments, 'controllers')
    const exists = await this.model.findOne({ id: dict.id }).exec()
    if (exists) throw new errors.AlreadyExists({ id: dict.id })
    return super.create(dict)
  }
}

class ResultsCollectionHandler<
  T extends { id: number; r: number; from_id: number },
> extends CollectionHandler<T> {
  constructor(model: Model<unknown>) {
    super(model, ['id', 'r', 'from_id'])
  }
}

class DrawsCollectionHandler<T extends { r: number }> extends CollectionHandler<T> {
  constructor(model: Model<unknown>) {
    super(model, ['r'])
  }
}

class RoundsCollectionHandler<T extends { r: number }> extends CollectionHandler<T> {
  constructor(model: Model<unknown>) {
    super(model, ['r'])
  }
}

class ConfigCollectionHandler extends CollectionHandler<ConfigRecord, ConfigRecord> {
  constructor(model: Model<unknown>) {
    super(model, ['db_url'], (docs) => docs[0] ?? ({} as ConfigRecord))
  }

  override findOne: never = undefined as never
  override delete: never = undefined as never
  override find: never = undefined as never
}

export interface DBOptions {
  id: number
  db_url?: string
  name?: string
  style?: StyleConfig
  user_defined_data?: UserDefinedData
}

export class DBHandler {
  conn: mongoose.Connection
  models: CreatedModels
  config: ConfigCollectionHandler
  rounds: RoundsCollectionHandler<RoundRecord>
  draws: DrawsCollectionHandler<DrawRecord>
  teams: EntityCollectionHandler<TeamEntity>
  adjudicators: EntityCollectionHandler<AdjudicatorEntity>
  venues: EntityCollectionHandler<VenueEntity>
  speakers: EntityCollectionHandler<SpeakerEntity>
  institutions: EntityCollectionHandler<InstitutionEntity>
  raw_team_results: ResultsCollectionHandler<RawTeamResult>
  raw_speaker_results: ResultsCollectionHandler<RawSpeakerResult>
  raw_adjudicator_results: ResultsCollectionHandler<RawAdjudicatorResult>

  constructor(dbUrl: string, options: DBOptions) {
    sillyLogger(DBHandler, arguments, 'controllers')
    const conn = mongoose.createConnection(dbUrl)
    this.conn = conn
    conn.on('error', (e: unknown) => sillyLogger(() => {}, [e], 'controllers'))
    conn.once('open', () => sillyLogger(() => {}, [`connected ${dbUrl}`], 'controllers'))

    const prefix = options.id.toString()
    const { models } = createSchemas(conn, prefix)
    this.models = models

    this.config = new ConfigCollectionHandler(models.Config as unknown as Model<unknown>)
    this.rounds = new RoundsCollectionHandler(
      models.Round as unknown as Model<unknown>
    )
    this.draws = new DrawsCollectionHandler(models.Draw as unknown as Model<unknown>)
    this.teams = new EntityCollectionHandler(
      models.Team as unknown as Model<unknown>
    )
    this.adjudicators = new EntityCollectionHandler(
      models.Adjudicator as unknown as Model<unknown>
    )
    this.venues = new EntityCollectionHandler(
      models.Venue as unknown as Model<unknown>
    )
    this.speakers = new EntityCollectionHandler(
      models.Speaker as unknown as Model<unknown>
    )
    this.institutions = new EntityCollectionHandler(
      models.Institution as unknown as Model<unknown>
    )

    this.raw_team_results = new ResultsCollectionHandler(
      models.RawTeamResult as unknown as Model<unknown>
    )
    this.raw_speaker_results = new ResultsCollectionHandler(
      models.RawSpeakerResult as unknown as Model<unknown>
    )
    this.raw_adjudicator_results = new ResultsCollectionHandler(
      models.RawAdjudicatorResult as unknown as Model<unknown>
    )

    if (options) {
      const fallbackStyle: StyleConfig = {
        team_num: 2,
        score_weights: [1, 1, 0.5],
      }
      const newOptions: ConfigRecord = cloneDeep({
        id: options.id,
        db_url: dbUrl,
        name: options.name ?? 'UTab Tournament',
        style: options.style ?? fallbackStyle,
        user_defined_data: options.user_defined_data ?? {},
      })
      this.config.create(newOptions as unknown as PlainRecord).catch(() => {})
    }
  }

  close(): void {
    sillyLogger(this.close, arguments, 'controllers')
    this.conn.close()
  }
}

export default DBHandler
