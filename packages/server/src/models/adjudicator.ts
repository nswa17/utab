import { Schema, type Connection, type InferSchemaType, type Model } from 'mongoose'

const adjudicatorDetailSchema = new Schema(
  {
    r: { type: Number, required: true },
    available: { type: Boolean, default: true },
    conflicts: { type: [String], default: [] },
    conflict_teams: { type: [String], default: [] },
  },
  { _id: false }
)

const adjudicatorTemplateSchema = new Schema(
  {
    available: { type: Boolean, default: true },
    conflicts: { type: [String], default: [] },
    conflict_teams: { type: [String], default: [] },
  },
  { _id: false }
)

const adjudicatorSchema = new Schema(
  {
    tournamentId: { type: Schema.Types.ObjectId, ref: 'Tournament', required: true },
    name: { type: String, required: true },
    strength: { type: Number, required: true },
    preev: { type: Number, default: 0 },
    template: { type: adjudicatorTemplateSchema, default: () => ({}) },
    details: { type: [adjudicatorDetailSchema], default: [] },
    userDefinedData: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
)

adjudicatorSchema.index({ tournamentId: 1, name: 1 }, { unique: true })

export type Adjudicator = InferSchemaType<typeof adjudicatorSchema>

export function getAdjudicatorModel(conn: Connection): Model<Adjudicator> {
  return (
    (conn.models.Adjudicator as Model<Adjudicator> | undefined) ??
    conn.model<Adjudicator>('Adjudicator', adjudicatorSchema)
  )
}
