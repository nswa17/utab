import mongoose, { Schema, Connection, Model, Document } from 'mongoose'

export interface ConfigDoc extends Document {
  id: number
  current_round_num: number
  total_round_num: number
  db_url: string
  name: string
  style: {
    id: string
    name: string
    team_num: number
    positions: string[]
    positions_short: string[]
    score_weights: number[]
  }
  preev_weights: number[]
  user_defined_data: Record<string, unknown>
}

export interface RoundDoc extends Document {
  r: number
  round_name: string
  team_allocation_opened: boolean
  adjudicator_allocation_opened: boolean
  motions: string[]
  weights_of_adjudicators: {
    chair: number
    panel: number
    trainee: number
  }
  user_defined_data: Record<string, unknown>
}

export interface AllocationDoc extends Document {
  r: number
  allocation: unknown
}

export interface EntityDetail {
  r: number
  available: boolean
  institutions?: number[]
  conflicts?: number[]
  speakers?: number[]
  priority?: number
}

export interface TeamDoc extends Document {
  id: number
  name: string
  user_defined_data: Record<string, unknown>
  details: EntityDetail[]
}

export interface AdjudicatorDoc extends Document {
  id: number
  preev: number
  name: string
  user_defined_data: Record<string, unknown>
  details: EntityDetail[]
}

export interface VenueDoc extends Document {
  id: number
  name: string
  user_defined_data: Record<string, unknown>
  details: EntityDetail[]
}

export interface SpeakerDoc extends Document {
  id: number
  name: string
  user_defined_data: Record<string, unknown>
}

export interface InstitutionDoc extends Document {
  id: number
  name: string
  user_defined_data: Record<string, unknown>
}

export interface RawSpeakerResultDoc extends Document {
  id: number
  from_id: number
  r: number
  weight: number
  scores: number[]
  user_defined_data: Record<string, unknown>
}

export interface RawTeamResultDoc extends Document {
  id: number
  from_id: number
  r: number
  weight: number
  win: number
  opponents: number[]
  side: string
  user_defined_data: Record<string, unknown>
}

export interface RawAdjudicatorResultDoc extends Document {
  id: number
  from_id: number
  r: number
  weight: number
  score: number
  judged_teams: number[]
  comment: string
  user_defined_data: Record<string, unknown>
}

export function createSchemas(conn: Connection, prefix: string) {
  const ConfigSchema = new Schema<ConfigDoc>(
    {
      id: { type: Number, required: true, unique: true },
      current_round_num: { type: Number, default: 1 },
      total_round_num: { type: Number, default: 4 },
      db_url: { type: String, required: true },
      name: { type: String, required: true },
      style: {
        id: { type: String, default: 'NA' },
        name: { type: String, default: 'North American' },
        team_num: { type: Number, default: 2 },
        positions: { type: [String], default: ['Government', 'Opposition'] },
        positions_short: { type: [String], default: ['Gov', 'Opp'] },
        score_weights: { type: [Number], default: [1, 1, 0.5] },
      },
      preev_weights: { type: [Number], default: [0, 0, 0, 0, 0, 0] },
      user_defined_data: { type: Schema.Types.Mixed, default: {} },
    },
    { timestamps: { createdAt: 'created', updatedAt: 'updated' }, versionKey: 'version' }
  )

  const RoundSchema = new Schema<RoundDoc>(
    {
      r: { type: Number, required: true, unique: true },
      round_name: { type: String, default: 'Round' },
      team_allocation_opened: { type: Boolean, default: true },
      adjudicator_allocation_opened: { type: Boolean, default: true },
      motions: { type: [String], default: ['THW test utab'] },
      weights_of_adjudicators: {
        chair: { type: Number, default: 1 },
        panel: { type: Number, default: 1 },
        trainee: { type: Number, default: 0 },
      },
      user_defined_data: { type: Schema.Types.Mixed, default: {} },
    },
    { timestamps: { createdAt: 'created', updatedAt: 'updated' }, versionKey: 'version' }
  )

  const DrawSchema = new Schema<AllocationDoc>(
    {
      r: { type: Number, required: true, unique: true },
      allocation: { type: Schema.Types.Mixed, required: true },
    },
    { timestamps: { createdAt: 'created', updatedAt: 'updated' }, versionKey: 'version' }
  )

  const AdjudicatorSchema = new Schema<AdjudicatorDoc>(
    {
      id: { type: Number, required: true, unique: true },
      preev: { type: Number, default: 0 },
      name: { type: String, required: true },
      user_defined_data: { type: Schema.Types.Mixed, default: {} },
      details: [
        {
          r: { type: Number, required: true },
          available: { type: Boolean, default: true },
          institutions: { type: [Number], default: [] },
          conflicts: { type: [Number], default: [] },
        },
      ],
    },
    { timestamps: { createdAt: 'created', updatedAt: 'updated' }, versionKey: 'version' }
  )

  const TeamSchema = new Schema<TeamDoc>(
    {
      id: { type: Number, required: true, unique: true },
      name: { type: String, required: true },
      user_defined_data: { type: Schema.Types.Mixed, default: {} },
      details: [
        {
          r: { type: Number, required: true },
          available: { type: Boolean, default: true },
          institutions: { type: [Number], default: [] },
          speakers: { type: [Number], default: [] },
        },
      ],
    },
    { timestamps: { createdAt: 'created', updatedAt: 'updated' }, versionKey: 'version' }
  )

  const VenueSchema = new Schema<VenueDoc>(
    {
      id: { type: Number, required: true, unique: true },
      name: { type: String, required: true },
      user_defined_data: { type: Schema.Types.Mixed, default: {} },
      details: [
        {
          r: { type: Number, required: true },
          priority: { type: Number, default: 1 },
          available: { type: Boolean, default: true },
        },
      ],
    },
    { timestamps: { createdAt: 'created', updatedAt: 'updated' }, versionKey: 'version' }
  )

  const SpeakerSchema = new Schema<SpeakerDoc>(
    {
      id: { type: Number, required: true, unique: true },
      name: { type: String, required: true },
      user_defined_data: { type: Schema.Types.Mixed, default: {} },
    },
    { timestamps: { createdAt: 'created', updatedAt: 'updated' }, versionKey: 'version' }
  )

  const InstitutionSchema = new Schema<InstitutionDoc>(
    {
      id: { type: Number, required: true, unique: true },
      name: { type: String, required: true },
      user_defined_data: { type: Schema.Types.Mixed, default: {} },
    },
    { timestamps: { createdAt: 'created', updatedAt: 'updated' }, versionKey: 'version' }
  )

  const RawSpeakerResultSchema = new Schema<RawSpeakerResultDoc>(
    {
      id: { type: Number, required: true, index: true },
      from_id: { type: Number, required: true, index: true },
      r: { type: Number, required: true, index: true },
      weight: { type: Number, default: 1 },
      scores: { type: [Number], required: true },
      user_defined_data: { type: Schema.Types.Mixed, default: {} },
    },
    { timestamps: { createdAt: 'created', updatedAt: 'updated' }, versionKey: 'version' }
  )
  RawSpeakerResultSchema.index({ id: 1, from_id: 1, r: 1 }, { unique: true })

  const RawTeamResultSchema = new Schema<RawTeamResultDoc>(
    {
      id: { type: Number, required: true, index: true },
      from_id: { type: Number, required: true, index: true },
      r: { type: Number, required: true, index: true },
      weight: { type: Number, default: 1 },
      win: { type: Number, required: true },
      opponents: { type: [Number], required: true },
      side: { type: String, required: true },
      user_defined_data: { type: Schema.Types.Mixed, default: {} },
    },
    { timestamps: { createdAt: 'created', updatedAt: 'updated' }, versionKey: 'version' }
  )
  RawTeamResultSchema.index({ id: 1, from_id: 1, r: 1 }, { unique: true })

  const RawAdjudicatorResultSchema = new Schema<RawAdjudicatorResultDoc>(
    {
      id: { type: Number, required: true, index: true },
      from_id: { type: Number, required: true, index: true },
      r: { type: Number, required: true, index: true },
      weight: { type: Number, default: 1 },
      score: { type: Number, required: true },
      judged_teams: { type: [Number], required: true },
      comment: { type: String, default: '' },
      user_defined_data: { type: Schema.Types.Mixed, default: {} },
    },
    { timestamps: { createdAt: 'created', updatedAt: 'updated' }, versionKey: 'version' }
  )
  RawAdjudicatorResultSchema.index({ id: 1, from_id: 1, r: 1 }, { unique: true })

  return {
    ConfigSchema,
    RoundSchema,
    DrawSchema,
    TeamSchema,
    AdjudicatorSchema,
    VenueSchema,
    SpeakerSchema,
    InstitutionSchema,
    RawSpeakerResultSchema,
    RawTeamResultSchema,
    RawAdjudicatorResultSchema,
    models: {
      Config: conn.model<ConfigDoc>(`${prefix}_Config`, ConfigSchema),
      Round: conn.model<RoundDoc>(`${prefix}_Round`, RoundSchema),
      Draw: conn.model<AllocationDoc>(`${prefix}_Draw`, DrawSchema),
      Team: conn.model<TeamDoc>(`${prefix}_Team`, TeamSchema),
      Adjudicator: conn.model<AdjudicatorDoc>(`${prefix}_Adjudicator`, AdjudicatorSchema),
      Venue: conn.model<VenueDoc>(`${prefix}_Venue`, VenueSchema),
      Speaker: conn.model<SpeakerDoc>(`${prefix}_Speaker`, SpeakerSchema),
      Institution: conn.model<InstitutionDoc>(`${prefix}_Institution`, InstitutionSchema),
      RawSpeakerResult: conn.model<RawSpeakerResultDoc>(
        `${prefix}_RawSpeakerResult`,
        RawSpeakerResultSchema
      ),
      RawTeamResult: conn.model<RawTeamResultDoc>(`${prefix}_RawTeamResult`, RawTeamResultSchema),
      RawAdjudicatorResult: conn.model<RawAdjudicatorResultDoc>(
        `${prefix}_RawAdjudicatorResult`,
        RawAdjudicatorResultSchema
      ),
    },
  }
}

export type CreatedModels = ReturnType<typeof createSchemas>['models']
