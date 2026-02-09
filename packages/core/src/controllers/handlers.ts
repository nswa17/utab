import mongoose, { Model } from 'mongoose'
import { cloneDeep } from 'lodash-es'
import { sillyLogger } from '../general/loggers.js'
import * as errors from '../general/errors.js'
import { createSchemas, CreatedModels } from './schemas.js'

mongoose.Promise = global.Promise

function arrangeDoc<T extends { _id?: unknown; details?: Array<{ _id?: unknown }> }>(
  doc: T
): Omit<T, '_id'> {
  const newDoc: any = JSON.parse(JSON.stringify(doc))
  delete newDoc._id
  if (newDoc.details) newDoc.details.forEach((d: any) => delete d._id)
  return newDoc
}

function pick(identityKeys: string[], dict: Record<string, unknown>) {
  const res: Record<string, unknown> = {}
  identityKeys.forEach((k) => {
    res[k] = dict[k]
  })
  return res
}

class CollectionHandler<T extends Record<string, any>> {
  constructor(
    protected model: Model<any>,
    private identifiers: string[]
  ) {}

  async read(): Promise<any> {
    sillyLogger(this.read, arguments, 'controllers')
    const docs = await this.model.find().exec()
    return docs.map(arrangeDoc)
  }

  async find(dict: Record<string, unknown>): Promise<any> {
    sillyLogger(this.find, arguments, 'controllers')
    const docs = await this.model.find(dict).exec()
    return docs.map(arrangeDoc)
  }

  async create(dict: Record<string, unknown>): Promise<any> {
    sillyLogger(this.create, arguments, 'controllers')
    const model = new this.model(dict)
    const saved = await model.save()
    return arrangeDoc(saved)
  }

  async update(dict: Record<string, any>): Promise<any> {
    sillyLogger(this.update, arguments, 'controllers')
    const identity = pick(this.identifiers, dict)
    const doc = await this.model
      .findOneAndUpdate(identity, { $set: dict, $inc: { version: 1 } }, { new: true })
      .exec()
    if (!doc) throw new errors.DoesNotExist(identity)
    return arrangeDoc(doc)
  }

  async delete(dict: Record<string, any>): Promise<any> {
    sillyLogger(this.delete, arguments, 'controllers')
    const identity = pick(this.identifiers, dict)
    const doc = await this.model.findOneAndDelete(identity).exec()
    if (!doc) throw new errors.DoesNotExist(identity)
    return arrangeDoc(doc)
  }

  async deleteAll(): Promise<any> {
    sillyLogger(this.deleteAll, arguments, 'controllers')
    const doc = await this.model.deleteMany({}).exec()
    return arrangeDoc(doc as any)
  }

  async findOne(dict: Record<string, any>): Promise<any> {
    sillyLogger(this.findOne, arguments, 'controllers')
    const identity = pick(this.identifiers, dict)
    const doc = await this.model.findOne(identity).exec()
    if (!doc) throw new errors.DoesNotExist(identity)
    return arrangeDoc(doc)
  }
}

class EntityCollectionHandler<T extends { id: number }> extends CollectionHandler<T> {
  constructor(Model: Model<any>) {
    super(Model, ['id'])
  }

  override async create(dict: Record<string, unknown>) {
    sillyLogger(this.create, arguments, 'controllers')
    const exists = await this.model.findOne({ id: dict.id }).exec()
    if (exists) throw new errors.AlreadyExists({ id: dict.id })
    return super.create(dict)
  }
}

class ResultsCollectionHandler<
  T extends { id: number; r: number; from_id: number },
> extends CollectionHandler<T> {
  constructor(Model: Model<any>) {
    super(Model, ['id', 'r', 'from_id'])
  }
}

class DrawsCollectionHandler<T extends { r: number }> extends CollectionHandler<T> {
  constructor(Model: Model<any>) {
    super(Model, ['r'])
  }
}

class RoundsCollectionHandler<T extends { r: number }> extends CollectionHandler<T> {
  constructor(Model: Model<any>) {
    super(Model, ['r'])
  }
}

class ConfigCollectionHandler<T extends { db_url: string }> extends CollectionHandler<T> {
  constructor(Model: Model<any>) {
    super(Model, ['db_url'])
  }

  override async read(): Promise<any> {
    const docs = await super.read()
    return (docs as any[])[0] ?? {}
  }

  // create/update as-is; find/findOne/delete disabled
  override findOne = undefined as any
  override delete = undefined as any
  override find = undefined as any
}

export interface DBOptions {
  id: number
  db_url?: string
  name?: string
  style?: any
  user_defined_data?: any
}

export class DBHandler {
  conn: mongoose.Connection
  models: CreatedModels
  config: ConfigCollectionHandler<any>
  rounds: RoundsCollectionHandler<any>
  draws: DrawsCollectionHandler<any>
  teams: EntityCollectionHandler<any>
  adjudicators: EntityCollectionHandler<any>
  venues: EntityCollectionHandler<any>
  speakers: EntityCollectionHandler<any>
  institutions: EntityCollectionHandler<any>
  raw_team_results: ResultsCollectionHandler<any>
  raw_speaker_results: ResultsCollectionHandler<any>
  raw_adjudicator_results: ResultsCollectionHandler<any>

  constructor(dbUrl: string, options: DBOptions) {
    sillyLogger(DBHandler, arguments, 'controllers')
    const conn = mongoose.createConnection(dbUrl)
    this.conn = conn
    conn.on('error', (e: unknown) => sillyLogger(() => {}, [e], 'controllers'))
    conn.once('open', () => sillyLogger(() => {}, [`connected ${dbUrl}`], 'controllers'))

    const prefix = options.id.toString()
    const { models } = createSchemas(conn, prefix)
    this.models = models

    this.config = new ConfigCollectionHandler(models.Config)
    this.rounds = new RoundsCollectionHandler(models.Round)
    this.draws = new DrawsCollectionHandler(models.Draw)
    this.teams = new EntityCollectionHandler(models.Team)
    this.adjudicators = new EntityCollectionHandler(models.Adjudicator)
    this.venues = new EntityCollectionHandler(models.Venue)
    this.speakers = new EntityCollectionHandler(models.Speaker)
    this.institutions = new EntityCollectionHandler(models.Institution)

    this.raw_team_results = new ResultsCollectionHandler(models.RawTeamResult)
    this.raw_speaker_results = new ResultsCollectionHandler(models.RawSpeakerResult)
    this.raw_adjudicator_results = new ResultsCollectionHandler(models.RawAdjudicatorResult)

    if (options) {
      const newOptions = cloneDeep(options)
      newOptions.db_url = dbUrl
      this.config.create(newOptions as unknown as Record<string, unknown>).catch(() => {})
    }
  }

  close() {
    sillyLogger(this.close, arguments, 'controllers')
    this.conn.close()
  }
}

export default DBHandler
